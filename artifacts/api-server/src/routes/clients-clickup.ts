import { Router, type IRouter } from "express";
import { and, eq, isNull, or } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import { syncClickUpCompanies } from "../lib/clickup-sync";
import { getCompanyMasterSyncStatus, listCompanyMirror, syncCompanyMaster } from "../lib/clickup-company-master";
import { asTrimmed } from "./clients-shared";
const router:IRouter=Router();
router.get("/clients/clickup/sync",async(_req,res)=>{try{res.json(await syncClickUpCompanies())}catch(err){res.status(502).json({error:"Kon de ClickUp-synchronisatie niet uitvoeren.",detail:err instanceof Error?err.message:String(err)})}});
router.get("/clickup/companies",async(_req,res)=>{res.json({companies:await listCompanyMirror(),sync:await getCompanyMasterSyncStatus()})});
router.get("/clickup/companies/sync-status",async(_req,res)=>{res.json(await getCompanyMasterSyncStatus())});
router.post("/clickup/companies/sync",async(_req,res)=>{try{res.json(await syncCompanyMaster())}catch(err){if((err as {code?:string})?.code==="ALREADY_RUNNING"){res.status(409).json({error:"Companies-sync loopt al."});return}res.status(502).json({error:"Companies master-sync mislukt; vorige cache blijft beschikbaar.",detail:err instanceof Error?err.message:String(err)})}});
function validateCompanyId(raw:string):string|{error:string}{return /^[a-z0-9]{4,40}$/i.test(raw)?raw:{error:"Ongeldig ClickUp bedrijf-id."}}
function isUniqueViolation(err:unknown){return (err as {code?:string})?.code==="23505"||(err as {cause?:{code?:string}})?.cause?.code==="23505"}
router.post("/clients/clickup/apply",async(req,res)=>{const links=Array.isArray(req.body?.links)?req.body.links:[],linked:{clientId:number;companyId:string}[]=[],errors:string[]=[];const rows=links.length?await db.select({id:clientsTable.id,companyId:clientsTable.clickupCompanyId}).from(clientsTable):[];const taken=new Set(rows.map(r=>(r.companyId??"").trim()).filter(Boolean));for(const raw of links){const l=(raw??{}) as Record<string,unknown>,clientId=Number(l.clientId),companyRaw=asTrimmed(l.companyId);if(!Number.isInteger(clientId)||clientId<=0||!companyRaw){errors.push("Ongeldige koppeling overgeslagen.");continue}const checked=validateCompanyId(companyRaw);if(typeof checked!=="string"){errors.push(checked.error);continue}if(taken.has(checked)){errors.push(`ClickUp-bedrijf ${checked} is al gekoppeld.`);continue}let updated;try{[updated]=await db.update(clientsTable).set({clickupCompanyId:checked,updatedAt:new Date()}).where(and(eq(clientsTable.id,clientId),or(isNull(clientsTable.clickupCompanyId),eq(clientsTable.clickupCompanyId,"")))).returning()}catch(err){if(isUniqueViolation(err)){taken.add(checked);errors.push(`ClickUp-bedrijf ${checked} is al gekoppeld.`);continue}throw err}if(updated){linked.push({clientId,companyId:checked});taken.add(checked)}else errors.push(`Klant ${clientId}: link kon niet compare-and-fill worden toegepast.`)}res.json({linked,errors})});
export default router;
