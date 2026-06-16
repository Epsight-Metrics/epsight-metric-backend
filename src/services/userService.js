const prisma = require('../db')
const bcrypt = require('bcryptjs')

async function getUsers({ name, username, role, isActive, page = 1, limit = 50 }) {
  const where = {
    ...(name       && { name:     { contains: name,     mode: 'insensitive' } }),
    ...(username   && { username: { contains: username, mode: 'insensitive' } }),
    ...(role       && { role }),
    ...(isActive   !== undefined && { isActive: isActive === 'true' }),
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    }),
    prisma.user.count({ where }),
  ])

  return { users, total, page: parseInt(page), limit: parseInt(limit) }
}

async function createUser({ username, name, role, password }, actorUserId) {
  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    const err = new Error('Username already exists')
    err.status = 409
    throw err
  }

  const user = await prisma.user.create({
    data: { 
      username, 
      password: await bcrypt.hash(password, 12), 
      name, 
      role 
    },
    select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
  })

  await prisma.activityLog.create({
    data: { userId: actorUserId, action: 'CREATE_USER', detail: `Created user ${username}` },
  })

  return user
}

async function updateUser(id, { name, role, password }, actorUserId) {
  const data = {}
  if (name) data.name = name
  if (role) data.role = role
  if (password) data.password = await bcrypt.hash(password, 12)

  const user = await prisma.user.update({
    where: { id: parseInt(id) },
    data,
    select: { id: true, username: true, name: true, role: true, isActive: true },
  })

  await prisma.activityLog.create({
    data: { userId: actorUserId, action: 'UPDATE_USER', detail: `Updated user ${user.username}` },
  })

  return user
}

async function deleteOrDeactivateUser(id, action, actorUserId) {
  const userId = parseInt(id)
  let updatedUser
  if (action === 'delete') {
    updatedUser = await prisma.user.delete({ where: { id: userId } })
  } else {
    updatedUser = await prisma.user.update({ where: { id: userId }, data: { isActive: false } })
  }

  await prisma.activityLog.create({
    data: { 
      userId: actorUserId, 
      action: action === 'delete' ? 'DELETE_USER' : 'DEACTIVATE_USER', 
      detail: `User id ${userId}` 
    },
  })

  return { message: 'Done' }
}

async function getActivityLogs({ userId, page = 1, limit = 50 }) {
  const where = userId ? { userId: parseInt(userId) } : {}
  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: { user: { select: { username: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    }),
    prisma.activityLog.count({ where }),
  ])

  return { logs, total, page: parseInt(page), limit: parseInt(limit) }
}

module.exports = {
  getUsers,
  createUser,
  updateUser,
  deleteOrDeactivateUser,
  getActivityLogs
}
