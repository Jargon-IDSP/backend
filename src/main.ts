import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'

const app = new Hono()

app.use('/*', cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}))

app.get('/', (c) => {
  return c.text('Hono TypeScript server is running! 🔥')
})

app.get('/api/test', (c) => {
  return c.json({ 
    message: 'Hono backend connected successfully!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  })
})

app.get('/api/users/:id', (c) => {
  const id = c.req.param('id')
  return c.json({ 
    userId: id, 
    message: `User ${id} data` 
  })
})

const port = Number(process.env.PORT) || 8000

console.log(`🚀 Server running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})