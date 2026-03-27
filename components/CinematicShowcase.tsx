import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import * as THREE from 'three';
import type { Article } from '../types';

gsap.registerPlugin(ScrollTrigger);

interface Props {
    articles: Article[];
}

export const CinematicShowcase: React.FC<Props> = ({ articles }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollReelRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    // Three.js Neural Sphere
    useEffect(() => {
        if (!canvasRef.current) return;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, alpha: true, antialias: true });
        
        renderer.setSize(200, 200);
        camera.position.z = 5;

        // Create Neural Sphere
        const geometry = new THREE.IcosahedronGeometry(1.5, 4);
        const material = new THREE.MeshPhysicalMaterial({
            color: 0x4f4aa2,
            emissive: 0x1a0b3b,
            wireframe: true,
            roughness: 0,
            metalness: 1,
            transparent: true,
            opacity: 0.8
        });
        
        const sphere = new THREE.Mesh(geometry, material);
        scene.add(sphere);

        // Lights
        const pointLight = new THREE.PointLight(0xf97316, 2, 10);
        pointLight.position.set(2, 2, 2);
        scene.add(pointLight);

        let animationFrameId: number;
        let clock = new THREE.Clock();

        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            const elapsedTime = clock.getElapsedTime();
            
            // Pulse effect
            const scale = 1 + Math.sin(elapsedTime * 2) * 0.05;
            sphere.scale.set(scale, scale, scale);
            
            // Rotation
            sphere.rotation.x += 0.005;
            sphere.rotation.y += 0.005;

            // React to hover
            if (hoveredIndex !== null) {
                material.color.setHex(0xf97316); // Orange glow
                material.emissive.setHex(0x5a180b);
                sphere.rotation.x += 0.02;
                sphere.rotation.y += 0.02;
            } else {
                material.color.setHex(0x4f4aa2); // Default Blue/Purple
                material.emissive.setHex(0x1a0b3b);
            }

            renderer.render(scene, camera);
        };
        animate();

        return () => {
            cancelAnimationFrame(animationFrameId);
            renderer.dispose();
            geometry.dispose();
            material.dispose();
        };
    }, [hoveredIndex]);

    // GSAP Horizontal Scroll
    useEffect(() => {
        if (!containerRef.current || !scrollReelRef.current) return;

        // Ensure we only pin if we have articles
        if (articles.length === 0) return;

        // Slight delay to ensure DOM is fully rendered for accurate widths
        const timer = setTimeout(() => {
            const pinWrap = scrollReelRef.current;
            if (!pinWrap || !containerRef.current) return;
            
            const pinWrapWidth = pinWrap.scrollWidth;
            const vw = window.innerWidth;

            const ctx = gsap.context(() => {
                gsap.to(pinWrap, {
                    x: () => -(pinWrapWidth - vw + 100), // scroll completely to end
                    ease: "none",
                    scrollTrigger: {
                        trigger: containerRef.current,
                        start: "top top",
                        end: () => `+=${pinWrapWidth}`,
                        scrub: 1,
                        pin: true,
                        invalidateOnRefresh: true,
                    }
                });
            }, containerRef);

            return () => ctx.revert();
        }, 100);
        
        return () => clearTimeout(timer);
    }, [articles]);

    if (!articles || articles.length === 0) return null;

    // We only take the top 8 articles for the horizontal reel to avoid infinite scrolls
    const highlightArticles = articles.slice(0, 8);

    return (
        <div ref={containerRef} className="relative h-screen w-full overflow-hidden bg-[#0a0510] text-white">
            {/* Neural Pulse Canvas */}
            <div className="pointer-events-none fixed bottom-10 right-10 z-50 h-[200px] w-[200px] mix-blend-screen transition-opacity duration-1000">
                <canvas ref={canvasRef} className="h-full w-full drop-shadow-[0_0_15px_rgba(249,115,22,0.8)]" />
                <div className="absolute inset-0 flex items-center justify-center text-center text-[10px] font-black tracking-[0.25em] text-[#f97316] opacity-90 drop-shadow-md">
                    NEURAL<br/>MATCH
                </div>
            </div>

            <div className="absolute top-16 left-12 z-40 max-w-2xl">
                <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-[#f97316] drop-shadow-sm">The Next Generation of Commerce</p>
                <h1 className="mt-4 text-5xl font-black leading-[0.95] tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-orange-300 via-pink-300 to-purple-400 sm:text-7xl">
                    Cinematic Shopping Engine
                </h1>
                <p className="mt-6 text-xl text-gray-300 drop-shadow-md">
                    Scroll to explore the curated showcase. The AI Sphere actively monitors your interactions to determine the perfect match.
                </p>
            </div>

            <div ref={scrollReelRef} className="flex h-screen items-center px-12 pt-32 w-max">
                {highlightArticles.map((article, idx) => (
                    <div 
                        key={article.id} 
                        className="group relative h-[65vh] w-[420px] shrink-0 mx-8 transition-all duration-700 hover:scale-[1.03]"
                        onMouseEnter={() => setHoveredIndex(idx)}
                        onMouseLeave={() => setHoveredIndex(null)}
                    >
                        {/* 3D Glass Card Background (Glassmorphism) */}
                        <div className="absolute inset-0 rounded-[2.5rem] bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_40px_100px_rgba(0,0,0,0.8)] transition-all duration-500 group-hover:bg-white/10 group-hover:border-white/20" />
                        
                        <div className="relative flex h-full flex-col justify-between p-8">
                            <div className="overflow-hidden rounded-[1.8rem] shadow-2xl relative">
                                <img 
                                    src={article.image_url || 'https://via.placeholder.com/400x300'} 
                                    alt={article.title} 
                                    className="aspect-video w-full object-cover transition-transform duration-[1.5s] ease-out group-hover:scale-110" 
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                            </div>
                            
                            <div className="mt-8 flex-1 relative">
                                <span className="inline-block rounded-full bg-orange-500/20 border border-orange-500/30 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.15)]">
                                    {article.category || 'High Performance'}
                                </span>
                                <h3 className="mt-5 text-[1.65rem] font-black leading-tight text-white line-clamp-3 [text-wrap:balance]">
                                    {article.title}
                                </h3>
                                
                                {/* Holographic Tooltip */}
                                <div className="absolute -top-48 left-1/2 -translate-x-1/2 opacity-0 transition-all duration-700 group-hover:-top-32 group-hover:opacity-100 pointer-events-none z-50">
                                    <div className="rounded-2xl border border-cyan-400/60 bg-cyan-900/90 px-6 py-4 text-center shadow-[0_0_30px_rgba(34,211,238,0.5)] backdrop-blur-md relative">
                                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[10px] border-t-cyan-400/60" />
                                        <p className="text-xs font-bold uppercase tracking-widest text-cyan-200 opacity-80 mb-1">Live Evaluation</p>
                                        <p className="text-xl font-black text-white">98% Match Rate</p>
                                        <div className="text-yellow-400 text-sm mt-1">★★★★★</div>
                                    </div>
                                </div>
                            </div>

                            {/* Metallic Buy Button */}
                            <div className="mt-4 translate-y-10 opacity-0 transition-all duration-700 ease-out group-hover:translate-y-0 group-hover:opacity-100">
                                <Link 
                                    to={`/blog/${article.slug}`} 
                                    className="block w-full rounded-full bg-gradient-to-r from-yellow-300 via-orange-400 to-red-500 p-[3px] shadow-[0_0_20px_rgba(249,115,22,0.4)] transition-all hover:shadow-[0_0_40px_rgba(249,115,22,0.8)]"
                                >
                                    <div className="flex w-full items-center justify-center rounded-full bg-[#0a0510] px-6 py-4 transition-colors duration-300 hover:bg-transparent">
                                        <span className="text-lg font-black tracking-wide text-white drop-shadow-md">Check Price on Amazon</span>
                                    </div>
                                </Link>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
