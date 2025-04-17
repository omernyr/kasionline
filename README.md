# Admin Login Website

This is a simple React application with admin login functionality. The admin credentials are hardcoded in the application.

## Admin Credentials
- Username: `admin`
- Password: `password123`

## Running Locally

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Start the development server:
   ```
   npm start
   ```
4. Visit `http://localhost:3000` in your browser

## Building for Production

To create a production build:
```
npm run build
```

To test the production build locally:
```
npm run serve
```

## Deploying to Netlify

### Option 1: Using Netlify CLI

1. Install Netlify CLI:
   ```
   npm install -g netlify-cli
   ```
2. Login to Netlify:
   ```
   netlify login
   ```
3. Deploy your site:
   ```
   netlify deploy --prod
   ```

### Option 2: Manual Deployment

1. Create a production build:
   ```
   npm run build
   ```
2. Go to [Netlify](https://app.netlify.com/)
3. Sign up or Log in
4. Drag and drop the `build` folder to the Netlify dashboard
5. Your site will be deployed with a Netlify subdomain

## Redirect Rules

The project includes a `netlify.toml` file that handles SPA redirects so that all routes lead back to the React application.
