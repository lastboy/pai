#!/usr/bin/env node
import { createProgram } from './program.js'

await createProgram((line) => console.log(line)).parseAsync(process.argv)
