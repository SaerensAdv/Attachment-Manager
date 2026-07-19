import { describe, expect, it } from "vitest";
import { buildGraph, type GraphBuildInput } from "./build";
const base=(over:Partial<GraphBuildInput>={}):GraphBuildInput=>({workspace:null,spaces:[],tasksByList:[],docs:[],docGraph:{nodes:[],edges:[],categories:[]},clients:[],clientFolderCompanyLinks:[],runs:[],pushRecords:[],...over});
describe("client-linked RUN graph policy",()=>{
 it("nests an eligible run beneath its technical client profile",()=>{const graph=buildGraph(base({clients:[{id:3,name:"Waterlek",companyName:"LCS BV",clickupCompanyId:"C1"}],runs:[{id:"42",label:"SEO report",status:"completed",updatedAt:null,clientId:3}]}));const run=graph.nodes.find(node=>node.id==="replit:run:42");expect(run?.parentId).toBe("replit:client:3");expect(graph.edges.some(edge=>edge.relation==="contains"&&edge.sourceId==="replit:client:3"&&edge.targetId==="replit:run:42")).toBe(true)});
 it("does not invent output runs from push records hidden by policy",()=>{const graph=buildGraph(base({pushRecords:[{sourceRunId:"old",clickupObjectId:"T1",clickupUrl:null,kind:"report",status:"succeeded",updatedAt:null}]}));expect(graph.nodes.some(node=>node.id==="replit:run:old")).toBe(false);expect(graph.edges.some(edge=>edge.relation==="generated")).toBe(false)});
});
