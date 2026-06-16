const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const prisma = require('../db')

const REFRESH_TOKEN_EXPIRY_DAYS = 7

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  )
}

async function loginUser(username, password, ip, userAgent) {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, password: true, name: true, role: true, isActive: true }
  })

  if (!user || !user.isActive) {
    const err = new Error('Invalid credentials')
    err.status = 401
    throw err
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    const err = new Error('Invalid credentials')
    err.status = 401
    throw err
  }

  // Generate tokens
  const accessToken = generateAccessToken(user)
  const refreshToken = crypto.randomBytes(64).toString('hex')
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  await prisma.$transaction([
    prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt } }),
    prisma.activityLog.create({ 
      data: { 
        userId: user.id, 
        action: 'LOGIN', 
        detail: JSON.stringify({ 
          username: user.username, 
          ip, 
          userAgent,
          timestamp: new Date().toISOString()
        })
      } 
    }),
  ])

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      username: user.username
    }
  }
}

async function refreshSession(token) {
  if (!token) {
    const err = new Error('No refresh token')
    err.status = 401
    throw err
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { token },
    include: { user: { select: { id: true, username: true, name: true, role: true, isActive: true } } }
  })

  if (!stored || stored.expiresAt < new Date() || !stored.user.isActive) {
    const err = new Error('Invalid or expired refresh token')
    err.status = 401
    throw err
  }

  // Rotate refresh token
  const newRefreshToken = crypto.randomBytes(64).toString('hex')
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  await prisma.$transaction([
    prisma.refreshToken.delete({ where: { token } }),
    prisma.refreshToken.create({ data: { token: newRefreshToken, userId: stored.userId, expiresAt } }),
  ])

  const accessToken = generateAccessToken(stored.user)

  return {
    accessToken,
    refreshToken: newRefreshToken,
    user: stored.user
  }
}

async function logoutUser(token, userId, username) {
  await prisma.$transaction([
    ...(token ? [prisma.refreshToken.deleteMany({ where: { token } })] : []),
    prisma.activityLog.create({ 
      data: { 
        userId: userId, 
        action: 'LOGOUT', 
        detail: `${username} logged out` 
      } 
    }),
  ])
}

module.exports = {
  loginUser,
  refreshSession,
  logoutUser,
  generateAccessToken
}
