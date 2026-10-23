import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const source = resolve(root, 'api')
const destination = resolve(root, 'dist', 'api')

mkdirSync(resolve(destination, 'uploads'), { recursive: true })
cpSync(resolve(source, 'index.php'), resolve(destination, 'index.php'))
cpSync(resolve(source, '.env.example'), resolve(destination, '.env.example'))
writeFileSync(resolve(destination, 'uploads', '.gitkeep'), '')
