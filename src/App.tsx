import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleMap, LoadScript, Marker } from '@react-google-maps/api';

// Calgary city boundaries (approximate)
const CALGARY_BOUNDS = {
    north: 51.2,
    south: 50.9,
    west: -114.3,
    east: -113.8,
};

// Map bounds for Calgary
const calgaryBounds = {
    north: CALGARY_BOUNDS.north,
    south: CALGARY_BOUNDS.south,
    west: CALGARY_BOUNDS.west,
    east: CALGARY_BOUNDS.east,
};

const containerStyle = {
    width: '100%',
    height: '100vh'
};

const mapContainerStyle = {
    width: '100%',
    height: '100%'
};

const defaultCenter = {
    lat: (CALGARY_BOUNDS.north + CALGARY_BOUNDS.south) / 2,
    lng: (CALGARY_BOUNDS.east + CALGARY_BOUNDS.west) / 2
};

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
    const [distance, setDistance] = useState<number>(0);
    const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
    const countdownRef = useRef<number | null>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const answerTimeoutRef = useRef<number | null>(null);

    // Debug API key
    useEffect(() => {
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
        console.log('API Key:', apiKey ? 'Present' : 'Missing');
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
        const newPosition = generateRandomLocation();
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
        if (!gameStarted || showStreetView || roundComplete) return;

        if (e.latLng) {
            const guess = {
                lat: e.latLng.lat(),
                lng: e.latLng.lng(),
            };
            setGuessPosition(guess);

            // Calculate score based on distance
            if (position) {
                const calculatedDistance = google.maps.geometry.spherical.computeDistanceBetween(
                    new google.maps.LatLng(position.lat, position.lng),
                    new google.maps.LatLng(guess.lat, guess.lng)
                );
                setDistance(calculatedDistance);
                const points = Math.max(0, 5000 - Math.floor(calculatedDistance));
                setScore(prev => prev + points);
                setRoundComplete(true);
                setShowAnswer(true);
                setShowCongrats(calculatedDistance <= 3000); // Show congrats if within 3km

                // Start next round after 3 seconds
                answerTimeoutRef.current = setTimeout(() => {
                    startNewRound();
                }, 3000);
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
            const streetViewService = new google.maps.StreetViewService();
            streetViewService.getPanorama({ location: position, radius: 50 }, (data, status) => {
                console.log('Street View Status:', status);
                if (status === 'OK' && data?.location?.pano) {
                    if (!panoramaRef.current) {
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
                        panoramaRef.current.setPano(data.location.pano);
                    }
                } else {
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
                                <p>Next round starting in {Math.ceil((answerTimeoutRef.current ? 3000 - (Date.now() - (answerTimeoutRef.current - 3000)) : 0) / 1000)} seconds...</p>
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

            <LoadScript
                googleMapsApiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                libraries={['geometry']}
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
                            height: 'calc(100vh - 80px)'
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
                            mapContainerStyle={{
                                ...containerStyle,
                                height: 'calc(100vh - 80px)'
                            }}
                            center={defaultCenter}
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
                                }
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
                            {roundComplete && position && (
                                <Marker
                                    position={position}
                                    icon={{
                                        url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'
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