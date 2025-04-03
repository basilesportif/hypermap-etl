#!/bin/bash
# Script to create Next.js project with predefined answers
(
echo "y" # TypeScript
echo "y" # ESLint
echo "y" # Tailwind CSS
echo "y" # App Router
echo "n" # import alias (use default)
echo "n" # customize default import alias? (use default)
echo "n" # Turbopack
) | npx create-next-app@latest .