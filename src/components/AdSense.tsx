import React, { useEffect, useRef } from 'react';

interface AdSenseProps {
    adSlot: string;
    style?: React.CSSProperties;
}

const AdSense: React.FC<AdSenseProps> = ({ adSlot, style }) => {
    const adRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        try {
            // @ts-ignore
            (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (error) {
            // Silently handle error
        }
    }, []);

    return (
        <ins
            ref={adRef}
            className="adsbygoogle"
            style={style}
            data-ad-client="ca-pub-1261809379963469"
            data-ad-slot={adSlot}
            data-ad-format="auto"
            data-full-width-responsive="true"
        />
    );
};

export default AdSense; 