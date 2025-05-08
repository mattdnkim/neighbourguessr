import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleMap, LoadScript, Marker, Polyline } from '@react-google-maps/api';

// Calgary city boundaries (approximate)
const CALGARY_BOUNDS = {
    north: 51.2,
    south: 50.9,
    west: -114.3,
    east: -113.8,
};

// Map bounds for Calgary with some padding
const calgaryBounds = {
    north: CALGARY_BOUNDS.north + 0.1,
    south: CALGARY_BOUNDS.south - 0.1,
    west: CALGARY_BOUNDS.west - 0.1,
    east: CALGARY_BOUNDS.east + 0.1,
};

const containerStyle = {
    width: '100%',
    height: '100vh'
};

const defaultCenter = {
    lat: (CALGARY_BOUNDS.north + CALGARY_BOUNDS.south) / 2,
    lng: (CALGARY_BOUNDS.east + CALGARY_BOUNDS.west) / 2
};

// Define libraries array outside component
const GOOGLE_MAPS_LIBRARIES: ("geometry" | "places" | "drawing" | "visualization")[] = ["geometry"];

const App: React.FC = () => {
    const [position, setPosition] = useState<google.maps.LatLngLiteral | null>(null);
    const [guessPosition, setGuessPosition] = useState<google.maps.LatLngLiteral | null>(null);
    const [score, setScore] = useState<number>(0);
    const [gameStarted, setGameStarted] = useState<boolean>(false);
    const [isLoaded, setIsLoaded] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [countdown, setCountdown] = useState<number>(10);
    const [showStreetView, setShowStreetView] = useState<boolean>(true);
    const [roundComplete, setRoundComplete] = useState<boolean>(false);
    const [mapVisible, setMapVisible] = useState<boolean>(false);
    const [showAnswer, setShowAnswer] = useState<boolean>(false);
    const [showCongrats, setShowCongrats] = useState<boolean>(false);
    const [showFailed, setShowFailed] = useState<boolean>(false);
    const [distance, setDistance] = useState<number>(0);
    const [showLine, setShowLine] = useState<boolean>(false);
    const [linePath, setLinePath] = useState<google.maps.LatLngLiteral[]>([]);
    const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
    const countdownRef = useRef<number | null>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const answerTimeoutRef = useRef<number | null>(null);
    const lineRef = useRef<google.maps.Polyline | null>(null);
    const [mapKey, setMapKey] = useState<number>(0);

    // Debug API key
    useEffect(() => {
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'YOUR_DEVELOPMENT_API_KEY';
        console.log('API Key:', apiKey ? 'Present' : 'Missing');
        console.log('Environment:', import.meta.env.MODE);
        if (!apiKey) {
            setError('API key is missing. Please check your .env file.');
        }
    }, []);

    const generateRandomLocation = useCallback(() => {
        const lat = CALGARY_BOUNDS.south + Math.random() * (CALGARY_BOUNDS.north - CALGARY_BOUNDS.south);
        const lng = CALGARY_BOUNDS.west + Math.random() * (CALGARY_BOUNDS.east - CALGARY_BOUNDS.west);
        return { lat, lng };
    }, []);

    const startNewRound = useCallback(() => {
        // Clear the line first and ensure it's completely removed
        setShowLine(false);
        setLinePath([]);

        // Force a complete map re-render
        setMapKey(prev => prev + 1);

        const newPosition = generateRandomLocation();
        console.log('Starting new round with position:', newPosition);

        // Then update other states
        setPosition(newPosition);
        setGuessPosition(null);
        setGameStarted(true);
        setError(null);
        setCountdown(10);
        setShowStreetView(true);
        setMapVisible(false);
        setRoundComplete(false);
        setShowAnswer(false);
        setShowCongrats(false);
        setShowFailed(false);
        setDistance(0);

        // Clear any existing timeouts
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
        }
        if (answerTimeoutRef.current) {
            clearTimeout(answerTimeoutRef.current);
        }

        // Start new countdown
        countdownRef.current = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(countdownRef.current!);
                    setShowStreetView(false);
                    setMapVisible(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, [generateRandomLocation]);

    const handleMapClick = (e: google.maps.MapMouseEvent) => {
        if (!gameStarted || showStreetView || roundComplete) {
            console.log('Map click ignored:', { gameStarted, showStreetView, roundComplete });
            return;
        }

        if (e.latLng) {
            const guess = {
                lat: e.latLng.lat(),
                lng: e.latLng.lng(),
            };
            console.log('Making guess:', guess);
            setGuessPosition(guess);

            // Calculate score based on distance
            if (position) {
                console.log('Current position:', position);
                const calculatedDistance = google.maps.geometry.spherical.computeDistanceBetween(
                    new google.maps.LatLng(position.lat, position.lng),
                    new google.maps.LatLng(guess.lat, guess.lng)
                );
                setDistance(calculatedDistance);
                const points = Math.max(0, 5000 - Math.floor(calculatedDistance));
                setScore(prev => prev + points);

                // Set the line path
                setLinePath([guess, position]);
                setShowLine(true);

                // Ensure these states are set in the correct order
                setRoundComplete(true);
                setShowAnswer(true);
                setShowCongrats(calculatedDistance <= 3000);
                setShowFailed(calculatedDistance > 3000);

                // Log the states for debugging
                console.log('Round complete:', true);
                console.log('Show answer:', true);
                console.log('Position:', position);
                console.log('Guess position:', guess);
                console.log('Distance:', calculatedDistance);

                // Animate to show both locations
                if (mapRef.current) {
                    // Calculate the center point between the two locations
                    const center = {
                        lat: (position.lat + guess.lat) / 2,
                        lng: (position.lng + guess.lng) / 2
                    };

                    // Create bounds to include both markers
                    const bounds = new google.maps.LatLngBounds();
                    bounds.extend(position);
                    bounds.extend(guess);

                    // Add padding to ensure both points are visible
                    const padding = {
                        top: 100,
                        right: 100,
                        bottom: 100,
                        left: 100
                    };

                    // First fit bounds to show both points
                    mapRef.current.fitBounds(bounds, padding);

                    // Then pan to the center point after a short delay
                    setTimeout(() => {
                        if (mapRef.current) {
                            mapRef.current.panTo(center);

                            // Ensure we don't zoom in too close
                            const listener = google.maps.event.addListener(mapRef.current, 'bounds_changed', () => {
                                if (mapRef.current) {
                                    const currentZoom = mapRef.current.getZoom();
                                    if (currentZoom && currentZoom > 15) {
                                        mapRef.current.setZoom(15);
                                    }
                                }
                                google.maps.event.removeListener(listener);
                            });
                        }
                    }, 100);
                }

                // Start next round after 5 seconds
                answerTimeoutRef.current = setTimeout(() => {
                    startNewRound();
                }, 5000);
            } else {
                console.log('No position available for comparison');
            }
        }
    };

    const onMapLoad = (map: google.maps.Map) => {
        mapRef.current = map;
        // Set the map bounds to Calgary
        const bounds = new google.maps.LatLngBounds(
            { lat: calgaryBounds.south, lng: calgaryBounds.west },
            { lat: calgaryBounds.north, lng: calgaryBounds.east }
        );
        map.fitBounds(bounds);
    };

    useEffect(() => {
        if (position && isLoaded) {
            console.log('Attempting to load Street View for position:', position);
            const streetViewService = new google.maps.StreetViewService();
            streetViewService.getPanorama({ location: position, radius: 50 }, (data, status) => {
                console.log('Street View Status:', status);
                console.log('Street View Data:', data);
                if (status === 'OK' && data?.location?.pano) {
                    console.log('Found panorama ID:', data.location.pano);
                    if (!panoramaRef.current) {
                        console.log('Creating new Street View panorama');
                        const panorama = new google.maps.StreetViewPanorama(
                            document.getElementById('street-view') as HTMLElement,
                            {
                                pano: data.location.pano,
                                visible: true,
                                addressControl: false,
                                showRoadLabels: false,
                                zoomControl: false,
                                fullscreenControl: false,
                                motionTracking: false,
                                motionTrackingControl: false,
                                panControl: false,
                                scrollwheel: false,
                                linksControl: false,
                                enableCloseButton: false,
                                clickToGo: false
                            }
                        );
                        panoramaRef.current = panorama;
                    } else {
                        console.log('Updating existing panorama with new ID:', data.location.pano);
                        panoramaRef.current.setPano(data.location.pano);
                    }
                } else {
                    console.error('Street View error:', status);
                    setError(`No Street View available at this location (${status}). Please try again.`);
                    startNewRound();
                }
            });
        }
    }, [position, isLoaded, startNewRound]);

    useEffect(() => {
        // Start a new round when the component mounts
        startNewRound();

        // Cleanup timeouts on unmount
        return () => {
            if (countdownRef.current) {
                clearInterval(countdownRef.current);
            }
            if (answerTimeoutRef.current) {
                clearTimeout(answerTimeoutRef.current);
            }
        };
    }, []);

    // Add cleanup effect
    useEffect(() => {
        return () => {
            // Clear line when component unmounts
            setShowLine(false);
            setLinePath([]);
        };
    }, []);

    // Add effect to clear line when round completes
    useEffect(() => {
        if (!roundComplete) {
            setShowLine(false);
            setLinePath([]);
        }
    }, [roundComplete]);

    if (!import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-100">
                <div className="text-center p-8 bg-white rounded-lg shadow-lg">
                    <h1 className="text-2xl font-bold text-red-600 mb-4">Configuration Error</h1>
                    <p className="mb-4">Please set up your Google Maps API key in the .env file:</p>
                    <code className="block bg-gray-100 p-2 rounded mb-4">VITE_GOOGLE_MAPS_API_KEY=your_api_key_here</code>
                    <p>Make sure to enable the following APIs in Google Cloud Console:</p>
                    <ul className="list-disc list-inside text-left mb-4">
                        <li>Maps JavaScript API</li>
                        <li>Street View Static API</li>
                        <li>Places API</li>
                    </ul>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen">
            <div className="bg-blue-600 text-white p-4">
                <h1 className="text-2xl font-bold">NeibourGuessr</h1>
                <div className="flex justify-between items-center">
                    <div>
                        <p>Score: {score}</p>
                        {showStreetView && <p>Time remaining: {countdown} seconds</p>}
                        {!showStreetView && !roundComplete && <p>Click on the map to make your guess!</p>}
                        {showAnswer && (
                            <div>
                                <p>Next round starting in {Math.ceil((answerTimeoutRef.current ? 5000 - (Date.now() - (answerTimeoutRef.current - 5000)) : 0) / 1000)} seconds...</p>
                                <p>Distance: {(distance / 1000).toFixed(2)} km</p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={startNewRound}
                        className="bg-white text-blue-600 px-4 py-2 rounded hover:bg-blue-100"
                    >
                        Skip to Next Round
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                    <span className="block sm:inline">{error}</span>
                </div>
            )}

            {showCongrats && (
                <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500 text-white p-6 rounded-lg shadow-xl z-50 text-center">
                    <h2 className="text-3xl font-bold mb-2">🎉 Congratulations! 🎉</h2>
                    <p className="text-xl">You were within 3km of the location!</p>
                    <p className="text-lg mt-2">Distance: {(distance / 1000).toFixed(2)} km</p>
                </div>
            )}

            {showFailed && (
                <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-red-500 text-white p-6 rounded-lg shadow-xl z-50 text-center">
                    <h2 className="text-3xl font-bold mb-2">❌ Try Again! ❌</h2>
                    <p className="text-xl">You were more than 3km away from the location</p>
                    <p className="text-lg mt-2">Distance: {(distance / 1000).toFixed(2)} km</p>
                </div>
            )}

            <LoadScript
                googleMapsApiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                libraries={GOOGLE_MAPS_LIBRARIES}
                onLoad={() => {
                    console.log('Google Maps loaded successfully');
                    setIsLoaded(true);
                }}
                onError={(error) => {
                    console.error('Google Maps load error:', error);
                    setError('Failed to load Google Maps. Please check your API key and console for details.');
                }}
            >
                <div className="flex-1 relative" style={{ marginTop: 'auto' }}>
                    <div
                        id="street-view"
                        style={{
                            ...containerStyle,
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            opacity: showStreetView ? 1 : 0,
                            transition: 'opacity 0.5s ease-in-out',
                            pointerEvents: showStreetView ? 'auto' : 'none',
                            zIndex: showStreetView ? 1 : 0,
                            height: 'calc(100vh - 80px)',
                            display: showStreetView ? 'block' : 'none'
                        }}
                    />

                    <div
                        style={{
                            ...containerStyle,
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            opacity: mapVisible ? 1 : 0,
                            transition: 'opacity 0.5s ease-in-out',
                            pointerEvents: mapVisible ? 'auto' : 'none',
                            zIndex: mapVisible ? 1 : 0,
                            height: 'calc(100vh - 80px)'
                        }}
                    >
                        <GoogleMap
                            key={mapKey}
                            mapContainerStyle={{
                                ...containerStyle,
                                height: 'calc(100vh - 80px)'
                            }}
                            center={guessPosition || position || defaultCenter}
                            zoom={11}
                            onClick={handleMapClick}
                            onLoad={onMapLoad}
                            options={{
                                streetViewControl: false,
                                mapTypeControl: false,
                                fullscreenControl: false,
                                zoomControl: true,
                                clickableIcons: false,
                                gestureHandling: 'greedy',
                                restriction: {
                                    latLngBounds: calgaryBounds,
                                    strictBounds: false
                                },
                                minZoom: 9,
                                maxZoom: 18
                            }}
                        >
                            {guessPosition && (
                                <Marker
                                    position={guessPosition}
                                    icon={{
                                        url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png'
                                    }}
                                />
                            )}
                            {showAnswer && position && (
                                <Marker
                                    position={position}
                                    icon={{
                                        url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'
                                    }}
                                />
                            )}
                            {showLine && linePath.length === 2 && !showStreetView && roundComplete && (
                                <Polyline
                                    key={`line-${linePath[0].lat}-${linePath[0].lng}-${linePath[1].lat}-${linePath[1].lng}`}
                                    path={linePath}
                                    options={{
                                        strokeColor: '#FF0000',
                                        strokeOpacity: 0.8,
                                        strokeWeight: 3,
                                        geodesic: true,
                                        icons: [{
                                            icon: {
                                                path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                                                scale: 3,
                                                strokeColor: '#FF0000',
                                            },
                                            offset: '50%',
                                        }],
                                    }}
                                />
                            )}
                        </GoogleMap>
                    </div>
                </div>
            </LoadScript>
        </div>
    );
};

export default App; 