# NeibourGuessr

A city-specific GeoGuessr clone that challenges players to guess locations within Calgary using Google Street View.

## Features

- Random Street View locations within Calgary city limits
- Interactive map for making guesses
- Distance-based scoring system
- Modern UI with TailwindCSS

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory and add your Google Maps API key:
   ```
   REACT_APP_GOOGLE_MAPS_API_KEY=your_api_key_here
   ```

4. Start the development server:
   ```bash
   npm start
   ```

## Google Maps API Requirements

You'll need a Google Maps API key with the following APIs enabled:
- Maps JavaScript API
- Street View Static API
- Geocoding API

## How to Play

1. Click "New Round" to start a new game
2. Explore the Street View image to find clues about your location
3. Click on the map to make your guess
4. Your score will be calculated based on how close your guess is to the actual location
5. Click "New Round" to try again!

## Scoring

- Maximum score: 5000 points
- Points decrease based on distance from actual location
- Closer guesses earn more points 