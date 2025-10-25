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

// Search for users
friendshipRoute.get("/search", searchUsers);

// Get friends list
friendshipRoute.get("/", getFriends);

// Get pending requests (received)
friendshipRoute.get("/pending", getPendingRequests);

// Get sent requests
friendshipRoute.get("/sent", getSentRequests);

// Send friend request
friendshipRoute.post("/", sendFriendRequest);

// Accept friend request
friendshipRoute.put("/:id/accept", acceptFriendRequest);

// Reject friend request
friendshipRoute.delete("/:id/reject", rejectFriendRequest);

// Remove friend
friendshipRoute.delete("/:id", removeFriend);

export default friendshipRoute;
