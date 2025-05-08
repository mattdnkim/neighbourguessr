import React, { useEffect } from 'react';

interface AdSenseProps {
    adSlot: string;
    adFormat?: string;
    style?: React.CSSProperties;
}

declare global {
    interface Window {
        adsbygoogle: any[];
    }
}

const AdSense: React.FC<AdSenseProps> = ({ adSlot, adFormat = 'auto', style = {} }) => {
    useEffect(() => {
        try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (error) {
            console.error('AdSense error:', error);
        }
    }, []);

    return (
        <ins
            className="adsbygoogle"
            style={{
                display: 'block',
                ...style,
            }}
            data-ad-client="ca-pub-1261809379963469"
            data-ad-slot={adSlot}
            data-ad-format={adFormat}
            data-full-width-responsive="true"
        />
    );
};

export default AdSense; 