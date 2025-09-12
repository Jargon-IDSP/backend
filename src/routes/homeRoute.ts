import { Hono } from "hono";
import { home } from "../controllers/homeController";

export const homeRoute = new Hono().get("/", home);
