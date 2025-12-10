# Use an official Node.js runtime as a parent image
FROM node:20-alpine

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
ENV NODE_ENV=production

# Command to run the app
CMD [ "npm", "start" ]
