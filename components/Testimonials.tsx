import React, { useState, useEffect } from 'react';

interface Testimonial {
    id: number;
    name: string;
    role: string;
    company: string;
    image: string;
    content: string;
    rating: number;
    metric?: string;
}

const testimonials: Testimonial[] = [
    {
        id: 1,
        name: "Sarah Mitchell",
        role: "Content Manager",
        company: "TechBlog Pro",
        image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=faces",
        content: "Postgenius Pro transformed our content workflow. We went from 2 articles per week to 15, and our SEO rankings improved by 340% in just 3 months.",
        rating: 5,
        metric: "340% SEO improvement"
    },
    {
        id: 2,
        name: "Marcus Chen",
        role: "Affiliate Marketer",
        company: "Digital Revenue Co",
        image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=faces",
        content: "The AI-generated product reviews are incredibly detailed. I've scaled from $2k to $15k monthly revenue using Postgenius Pro for my affiliate sites.",
        rating: 5,
        metric: "$15k monthly revenue"
    },
    {
        id: 3,
        name: "Emily Rodriguez",
        role: "Food Blogger",
        company: "Tasty Bites Blog",
        image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=faces",
        content: "Creating recipe posts used to take me 4 hours. Now it takes 5 minutes. The quality is amazing and my readers can't tell the difference!",
        rating: 5,
        metric: "48x faster content"
    },
    {
        id: 4,
        name: "David Park",
        role: "SEO Specialist",
        company: "Growth Marketing Agency",
        image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=faces",
        content: "The SEO optimization is next-level. Every article hits 90+ on Yoast. Our clients are seeing first-page rankings within weeks.",
        rating: 5,
        metric: "90+ SEO scores"
    },
    {
        id: 5,
        name: "Lisa Thompson",
        role: "E-commerce Owner",
        company: "HomeStyle Shop",
        image: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=200&h=200&fit=crop&crop=faces",
        content: "I use it for product descriptions and buying guides. Conversion rates increased 28% and I save 20 hours per week. Absolute game-changer!",
        rating: 5,
        metric: "28% conversion boost"
    }
];

const Testimonials: React.FC = () => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isAutoPlaying, setIsAutoPlaying] = useState(true);

    useEffect(() => {
        if (!isAutoPlaying) return;

        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % testimonials.length);
        }, 5000);

        return () => clearInterval(interval);
    }, [isAutoPlaying]);

    const goToSlide = (index: number) => {
        setCurrentIndex(index);
        setIsAutoPlaying(false);
    };

    const nextSlide = () => {
        setCurrentIndex((prev) => (prev + 1) % testimonials.length);
        setIsAutoPlaying(false);
    };

    const prevSlide = () => {
        setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
        setIsAutoPlaying(false);
    };

    const currentTestimonial = testimonials[currentIndex];

    return (
        <div className="w-full py-16 sm:py-24 bg-gradient-to-b from-background to-background/50">
            <div className="max-w-6xl mx-auto px-4 sm:px-8">
                <div className="text-center mb-12">
                    <h2 className="text-3xl sm:text-4xl font-bold font-heading text-text-headings mb-4">
                        Trusted by <span className="text-transparent bg-clip-text bg-gradient-to-r from-cta to-accent">10,000+</span> Content Creators
                    </h2>
                    <p className="text-text-secondary text-lg">See what our users are saying about their success</p>
                </div>

                <div className="relative">
                    {/* Main Testimonial Card */}
                    <div className="bg-card-bg backdrop-blur-xl border border-border-color rounded-2xl p-8 sm:p-12 shadow-2xl">
                        <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
                            {/* Avatar */}
                            <div className="flex-shrink-0">
                                <img
                                    src={currentTestimonial.image}
                                    alt={currentTestimonial.name}
                                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-accent/20 shadow-lg object-cover"
                                />
                            </div>

                            {/* Content */}
                            <div className="flex-1 text-center md:text-left">
                                {/* Stars */}
                                <div className="flex justify-center md:justify-start gap-1 mb-4">
                                    {[...Array(currentTestimonial.rating)].map((_, i) => (
                                        <svg key={i} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                                            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                                        </svg>
                                    ))}
                                </div>

                                {/* Quote */}
                                <p className="text-text-primary text-lg sm:text-xl leading-relaxed mb-6 italic">
                                    "{currentTestimonial.content}"
                                </p>

                                {/* Author Info */}
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                    <div>
                                        <p className="text-text-headings font-bold text-lg">{currentTestimonial.name}</p>
                                        <p className="text-text-secondary text-sm">{currentTestimonial.role} at {currentTestimonial.company}</p>
                                    </div>
                                    {currentTestimonial.metric && (
                                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 border border-accent/20 rounded-full">
                                            <span className="text-accent font-bold text-sm">{currentTestimonial.metric}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Navigation Arrows */}
                    <button
                        onClick={prevSlide}
                        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 sm:-translate-x-6 w-12 h-12 bg-card-bg border border-border-color rounded-full flex items-center justify-center hover:bg-accent/10 hover:border-accent/30 transition-all shadow-lg"
                        aria-label="Previous testimonial"
                    >
                        <svg className="w-6 h-6 text-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <button
                        onClick={nextSlide}
                        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 sm:translate-x-6 w-12 h-12 bg-card-bg border border-border-color rounded-full flex items-center justify-center hover:bg-accent/10 hover:border-accent/30 transition-all shadow-lg"
                        aria-label="Next testimonial"
                    >
                        <svg className="w-6 h-6 text-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>

                    {/* Dots Navigation */}
                    <div className="flex justify-center gap-2 mt-8">
                        {testimonials.map((_, index) => (
                            <button
                                key={index}
                                onClick={() => goToSlide(index)}
                                className={`w-2.5 h-2.5 rounded-full transition-all ${index === currentIndex
                                        ? 'bg-accent w-8'
                                        : 'bg-border-color hover:bg-accent/50'
                                    }`}
                                aria-label={`Go to testimonial ${index + 1}`}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Testimonials;
