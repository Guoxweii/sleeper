import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'

const ALGORITHM = 'sha512'
const ITERATIONS = 120000
const KEY_LENGTH = 64

export function hashPassword(password) {
  const salt = randomBytes(16).toString('base64')
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, ALGORITHM).toString('base64')
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`
}

export function verifyPassword(password, passwordHash) {
  if (!passwordHash || typeof passwordHash !== 'string') {
    return false
  }

  const [strategy, roundsString, salt, expectedHash] = passwordHash.split('$')
  if (strategy !== 'pbkdf2' || !roundsString || !salt || !expectedHash) {
    return false
  }

  const rounds = Number(roundsString)
  if (!Number.isFinite(rounds) || rounds <= 0) {
    return false
  }

  const actual = pbkdf2Sync(password, salt, rounds, KEY_LENGTH, ALGORITHM)
  const expected = Buffer.from(expectedHash, 'base64')

  if (actual.length !== expected.length) {
    return false
  }

  return timingSafeEqual(actual, expected)
}
