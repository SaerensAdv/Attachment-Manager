import { Router, type IRouter } from "express";
import { GetTeamResponse } from "@workspace/api-zod";
import { getTeamRoster } from "../lib/team";

const router: IRouter = Router();

router.get("/team", async (req, res): Promise<void> => {
  const employees = await getTeamRoster();
  res.json(GetTeamResponse.parse({ employees }));
});

export default router;
