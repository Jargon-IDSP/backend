import { Hono } from "hono";
import { PrismaClient } from '@prisma/client'
import { getFlashcards, getRandomFlashcard } from "../controllers/flashcardController";

const prisma = new PrismaClient();

export const flashcardRoute = new Hono()
.get("/", getFlashcards)
.get("/random", getRandomFlashcard);
