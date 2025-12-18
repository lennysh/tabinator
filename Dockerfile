# Use an official Node.js runtime as a parent image
# Using Debian-based image instead of Alpine for better native module compatibility
FROM node:20-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy the app source
COPY . .

# Create data directory for SQLite database
RUN mkdir -p /usr/src/app/data

# Expose port 8080
EXPOSE 8080

# Define environment variable
# Note: Set NODE_ENV=production only if using HTTPS
# For HTTP development, leave unset or set to development
# ENV NODE_ENV=production

# Command to run the app
CMD [ "npm", "start" ]
