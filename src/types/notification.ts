import type { NotificationType } from "@prisma/client";

export type { NotificationType };

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  documentId?: string;
  followId?: string;
  lessonRequestId?: string;
}
