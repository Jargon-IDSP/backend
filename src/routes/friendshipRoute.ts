import { Hono } from "hono";
import {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  getFriends,
  getPendingRequests,
  getSentRequests,
  searchUsers,
} from "../controllers/friendshipController";
import { authMiddleware } from "../middleware/authMiddleware";

const friendshipRoute = new Hono();

friendshipRoute.use("*", authMiddleware);

friendshipRoute.get("/search", searchUsers);

friendshipRoute.get("/", getFriends);

friendshipRoute.get("/pending", getPendingRequests);

friendshipRoute.get("/sent", getSentRequests);

friendshipRoute.post("/", sendFriendRequest);

friendshipRoute.put("/:id/accept", acceptFriendRequest);

friendshipRoute.delete("/:id/reject", rejectFriendRequest);

friendshipRoute.delete("/:id", removeFriend);

export default friendshipRoute;
