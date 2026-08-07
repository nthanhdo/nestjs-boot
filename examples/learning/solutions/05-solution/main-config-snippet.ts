// Add this to your auth config in main.ts:

/*
auth: {
  jwt: {
    secret: process.env.JWT_SECRET || 'learning-project-secret-change-me',
    signOptions: { expiresIn: '15m' },
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'learning-project-refresh-secret',
    refreshExpiresIn: '7d',
  },
  rbac: {                                    // <-- ADDED
    enabled: true,
    extractRoles: (request: any) => {
      return request.user?.roles || [];
    },
  },
},
*/

// Then manually promote a user to admin in MongoDB:
//   mongosh
//   use learning
//   db.users.updateOne({ email: 'admin@example.com' }, { $set: { roles: ['admin'] } })
