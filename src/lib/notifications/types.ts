export interface NotificationItem {
  id: string
  userId: string
  type: string
  title: string
  message: string
  read: boolean
  createdAt: string
}

export interface NotificationList {
  ownerId: string
  notifications: NotificationItem[]
  unreadCount: number
  nextCursor: string | null
}
