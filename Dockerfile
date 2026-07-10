# Use official Node.js image as base
FROM node:20-alpine

# Create and set working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the TypeScript code
RUN npm run build

# Expose the application port (matching the PORT in your .env)
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
