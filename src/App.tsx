import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleMap, LoadScript, Marker, Polyline } from '@react-google-maps/api';
// import AdSense from './components/AdSense';

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
    const [showHint, setShowHint] = useState<boolean>(false);
    const [hintText, setHintText] = useState<string>('');
    const [hintUsed, setHintUsed] = useState<boolean>(false);
    const [isRateLimited, setIsRateLimited] = useState<boolean>(false);
    const [rateLimitMessage, setRateLimitMessage] = useState<string>('');
    const lastApiCallRef = useRef<number>(0);
    const apiCallCountRef = useRef<number>(0);
    const rateLimitResetTimeoutRef = useRef<number | null>(null);

    // Constants for rate limiting
    const RATE_LIMIT_WINDOW = 60000; // 1 minute in milliseconds
    const MAX_API_CALLS = 10; // Maximum API calls per minute
    const RATE_LIMIT_DURATION = 300000; // 5 minutes in milliseconds

    // Add geocoder service
    const geocoder = useRef<google.maps.Geocoder | null>(null);

    // Debug API key
    useEffect(() => {
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'YOUR_DEVELOPMENT_API_KEY';
        if (!apiKey) {
            setError('Configuration error. Please contact support.');
        }
    }, []);

    const generateRandomLocation = useCallback(() => {
        const lat = CALGARY_BOUNDS.south + Math.random() * (CALGARY_BOUNDS.north - CALGARY_BOUNDS.south);
        const lng = CALGARY_BOUNDS.west + Math.random() * (CALGARY_BOUNDS.east - CALGARY_BOUNDS.west);
        return { lat, lng };
    }, []);

    const checkRateLimit = useCallback(() => {
        const now = Date.now();
        const timeSinceLastCall = now - lastApiCallRef.current;

        // Reset count if window has passed
        if (timeSinceLastCall > RATE_LIMIT_WINDOW) {
            apiCallCountRef.current = 0;
        }

        // Check if we're over the limit
        if (apiCallCountRef.current >= MAX_API_CALLS) {
            setIsRateLimited(true);
            setRateLimitMessage('Rate limit reached. Please wait a few minutes before trying again.');

            // Set timeout to reset rate limit
            if (rateLimitResetTimeoutRef.current) {
                clearTimeout(rateLimitResetTimeoutRef.current);
            }
            rateLimitResetTimeoutRef.current = window.setTimeout(() => {
                setIsRateLimited(false);
                setRateLimitMessage('');
                apiCallCountRef.current = 0;
            }, RATE_LIMIT_DURATION);

            return true;
        }

        // Update counters
        apiCallCountRef.current++;
        lastApiCallRef.current = now;
        return false;
    }, []);

    const startNewRound = useCallback(() => {
        if (isRateLimited) {
            return;
        }

        if (checkRateLimit()) {
            return;
        }

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
        setShowHint(false);
        setHintText('');
        setHintUsed(false);

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
    }, [isRateLimited, checkRateLimit, generateRandomLocation]);

    const handleMapClick = (e: google.maps.MapMouseEvent) => {
        if (!gameStarted || showStreetView || roundComplete || isRateLimited) {
            return;
        }

        if (checkRateLimit()) {
            return;
        }

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

                // Set the line path
                setLinePath([guess, position]);
                setShowLine(true);

                // Ensure these states are set in the correct order
                setRoundComplete(true);
                setShowAnswer(true);
                setShowCongrats(calculatedDistance <= 3000);
                setShowFailed(calculatedDistance > 3000);

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
                    setError('Unable to load street view. Please try again.');
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

    // Function to get quadrant from coordinates
    const getQuadrant = (lat: number, lng: number): string => {
        const centerLat = (CALGARY_BOUNDS.north + CALGARY_BOUNDS.south) / 2;
        const centerLng = (CALGARY_BOUNDS.east + CALGARY_BOUNDS.west) / 2;

        if (lat > centerLat && lng > centerLng) return "Northeast";
        if (lat > centerLat && lng < centerLng) return "Northwest";
        if (lat < centerLat && lng > centerLng) return "Southeast";
        return "Southwest";
    };

    // Function to get address hint
    const getAddressHint = useCallback(async (position: google.maps.LatLngLiteral) => {
        if (isRateLimited) {
            return;
        }

        if (checkRateLimit()) {
            return;
        }

        if (!geocoder.current) {
            geocoder.current = new google.maps.Geocoder();
        }

        try {
            const result = await geocoder.current.geocode({ location: position });
            if (result.results[0]) {
                const address = result.results[0].formatted_address;
                const quadrant = getQuadrant(position.lat, position.lng);

                const hasQuadrantInAddress = address.toLowerCase().includes('northeast') ||
                    address.toLowerCase().includes('northwest') ||
                    address.toLowerCase().includes('southeast') ||
                    address.toLowerCase().includes('southwest') ||
                    address.toLowerCase().includes(' ne ') ||
                    address.toLowerCase().includes(' nw ') ||
                    address.toLowerCase().includes(' se ') ||
                    address.toLowerCase().includes(' sw ');

                if (hasQuadrantInAddress) {
                    setHintText(`Location is in ${quadrant} Calgary, near ${address}`);
                } else {
                    setHintText(`Location is in a suburb of ${quadrant} Calgary, near ${address}`);
                }
            }
        } catch (error) {
            const quadrant = getQuadrant(position.lat, position.lng);
            setHintText(`Location is in a suburb of ${quadrant} Calgary`);
        }
    }, [isRateLimited, checkRateLimit]);

    if (!import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-100">
                <div className="text-center p-8 bg-white rounded-lg shadow-lg">
                    <h1 className="text-2xl font-bold text-red-600 mb-4">Configuration Error</h1>
                    <p className="mb-4">Please contact support for assistance.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen">
            <div className="bg-blue-600 text-white p-2 fixed top-0 left-0 right-0 z-50">
                <h1 className="text-xl font-bold">NeibourGuessr</h1>
                <div className="flex justify-between items-center text-sm">
                    <div>
                        <p>Score: {score}</p>
                        {showStreetView && <p>Time remaining: {countdown} seconds</p>}
                        {!showStreetView && !roundComplete && (
                            <div className="flex items-center gap-2">
                                <p>Click on the map to make your guess!</p>
                                {!hintUsed && (
                                    <button
                                        onClick={() => {
                                            if (position) {
                                                getAddressHint(position);
                                                setShowHint(true);
                                                setHintUsed(true);
                                            }
                                        }}
                                        className="bg-yellow-500 text-white px-2 py-1 rounded text-xs hover:bg-yellow-600"
                                    >
                                        Get Hint
                                    </button>
                                )}
                            </div>
                        )}
                        {showAnswer && (
                            <div>
                                <p>Next round starting in {Math.ceil((answerTimeoutRef.current ? 5000 - (Date.now() - (answerTimeoutRef.current - 5000)) : 0) / 1000)} seconds...</p>
                                <p>Distance: {(distance / 1000).toFixed(2)} km</p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={startNewRound}
                        className="bg-white text-blue-600 px-3 py-1 rounded hover:bg-blue-100 text-sm"
                    >
                        Skip to Next Round
                    </button>
                </div>
                {isRateLimited && (
                    <div className="bg-red-500 text-white px-4 py-2 rounded mt-2">
                        {rateLimitMessage}
                    </div>
                )}
            </div>

            {/* Add padding to account for fixed header */}
            <div className="pt-20">
                {/* Show hint if available */}
                {showHint && hintText && (
                    <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-2 rounded relative mx-4 my-2" role="alert">
                        <span className="block sm:inline">{hintText}</span>
                    </div>
                )}

                {/* Add AdSense component only after failed guess */}
                {/* {showFailed && (
                    <div className="w-full flex justify-center my-2 bg-gray-100 py-2">
                        <AdSense
                            adSlot="6487589511"
                            style={{ 
                                display: 'block', 
                                width: '320px', 
                                height: '100px',
                                margin: '0 auto'
                            }}
                        />
                    </div>
                )} */}

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
        </div>
    );
};

export default App; 