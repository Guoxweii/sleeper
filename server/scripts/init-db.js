import { createDb, seedAdminUser, seedDefaultBoards } from '../src/db.js'

const db = createDb()

const seededAdmin = seedAdminUser(db)
const seededBoards = seedDefaultBoards(db)

if (seededAdmin) {
  console.log(`管理员账号已创建: ${seededAdmin.username}`)
  console.log('请尽快修改默认密码，避免在公网环境使用弱口令。')
} else {
  console.log('管理员账号已存在，跳过创建。')
}

if (seededBoards.length > 0) {
  console.log(`默认 Board 已创建: ${seededBoards.join(' / ')}`)
} else {
  console.log('Board 已存在，跳过默认 Board 创建。')
}

db.close()
