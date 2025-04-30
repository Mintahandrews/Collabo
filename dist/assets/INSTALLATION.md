# Installation Guide for Collabo

This guide will walk you through the process of setting up Collabo on your local machine for development or personal use.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v14.x or higher)
- **npm** (v6.x or higher) or **yarn** (v1.22.x or higher)
- A modern web browser (Chrome, Firefox, Safari, or Edge)

## Step 1: Clone the Repository

```bash
# Using HTTPS
git clone https://github.com/codemintah/collabo.git

# Using SSH
git clone git@github.com:codemintah/collabo.git

# Navigate to the project directory
cd collabo
```

## Step 2: Install Dependencies

```bash
# Using npm
npm install

# Using yarn
yarn
```

## Step 3: Environment Configuration

Create a `.env.local` file in the root directory with the following variables:

```
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
```

## Step 4: Start the Development Server

```bash
# Using npm
npm run dev

# Using yarn
yarn dev
```

The application should now be running at `http://localhost:3000`.

## Step 5: Accessing the Application

Open your web browser and navigate to:

```
http://localhost:3000
```

You should see the Collabo home page. From here, you can create a new whiteboard room or join an existing one.

## Production Deployment

For production deployment, follow these steps:

### Building the Application

```bash
# Using npm
npm run build

# Using yarn
yarn build
```

### Starting the Production Server

```bash
# Using npm
npm run start

# Using yarn
yarn start
```

## Docker Deployment (Optional)

If you prefer to use Docker, a Dockerfile is provided:

```bash
# Build the Docker image
docker build -t collabo .

# Run the container
docker run -p 3000:3000 collabo
```

## Troubleshooting

If you encounter any issues during installation, try the following:

1. Ensure you have the correct versions of Node.js and npm/yarn installed
2. Clear your npm/yarn cache:
   ```bash
   npm cache clean --force
   # or
   yarn cache clean
   ```
3. Delete the `node_modules` folder and reinstall dependencies:
   ```bash
   rm -rf node_modules
   npm install
   # or
   yarn
   ```
4. Check for any errors in the console output

## Next Steps

Once you have Collabo up and running, you can:

- Create a new room and share the URL with collaborators
- Explore the different drawing tools and features
- Set up video chat with participants
- Customize the whiteboard to your liking

For more information, refer to the [User Guide](./USER_GUIDE.md) and [Features Documentation](./FEATURES.md).
