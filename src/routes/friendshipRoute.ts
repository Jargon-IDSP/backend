import { Hono } from "hono";
import {
  followUser,
  unfollowUser,
  blockUser,
  unblockUser,
  getFollowing,
  getFollowers,
  getFriends,
  getBlockedUsers,
  searchUsers,
} from "../controllers/friendshipController";
import { authMiddleware } from "../middleware/authMiddleware";

const friendshipRoute = new Hono();

friendshipRoute.use("*", authMiddleware);

// Search users
friendshipRoute.get("/search", searchUsers);

// Get relationships
friendshipRoute.get("/friends", getFriends);
friendshipRoute.get("/following", getFollowing);
friendshipRoute.get("/followers", getFollowers);
friendshipRoute.get("/blocked", getBlockedUsers);

// Follow/Unfollow
friendshipRoute.post("/follow", followUser);
friendshipRoute.delete("/:id/unfollow", unfollowUser);

// Block/Unblock
friendshipRoute.post("/block", blockUser);
friendshipRoute.delete("/:id/unblock", unblockUser);

export default friendshipRoute;
