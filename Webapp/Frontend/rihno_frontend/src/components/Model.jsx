import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { useLoader, useThree, useFrame } from '@react-three/fiber';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { PresentationControls, useScroll } from '@react-three/drei';
import * as THREE from 'three';

const Model = () => {
    const obj = useLoader(OBJLoader, '/rihno.obj');
    const scroll = useScroll();
    const modelRef = useRef();
    
    // Add mobile detection
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useFrame(() => {
        const r1 = scroll.range(0, 1);

        if (modelRef.current) {
            if (isMobile) {
                // Mobile layout - shift down and somewhat centered
                modelRef.current.position.x = THREE.MathUtils.lerp(0.2, 0, r1);
                modelRef.current.position.y = THREE.MathUtils.lerp(-1.0, -1.2, r1);
                modelRef.current.position.z = THREE.MathUtils.lerp(0.5, 0.5, r1);
            } else {
                // Desktop layout - original placements
                modelRef.current.position.x = THREE.MathUtils.lerp(2, 1.3, r1);
                modelRef.current.position.y = THREE.MathUtils.lerp(0.2, 0.2, r1);
                modelRef.current.position.z = THREE.MathUtils.lerp(0.5, 0.5, r1);
            }

            // Shared rotation
            modelRef.current.rotation.y = THREE.MathUtils.lerp(0, Math.PI / 2, r1);
        }
    });

    useLayoutEffect(() => {
        obj.traverse((child) => {
            if (child.isMesh) {
                child.material = new THREE.MeshStandardMaterial({
                    color: '#676767',
                    roughness: 0.0,
                    metalness: 0.9,
                });
            }
        });
    }, [obj]);

    return (
        <PresentationControls
            speed={1.5}
            global={false}
            polar={[-0.1, Math.PI / 4]}
            azimuth={[-Math.PI / 4, Math.PI / 4]}
        >
            <group ref={modelRef}>
                <primitive
                    object={obj}
                    scale={isMobile ? 1.4 : 2} // Scale down on mobile
                />
            </group>
        </PresentationControls>
    );
};

export default Model;