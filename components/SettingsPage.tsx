
import React, { useState, useEffect, useCallback } from 'react';
import type { Session } from '../types';

import { updateUserProfile, updateUserStyleConfig, uploadImage, getPublicUrl, AVATARS_BUCKET_NAME } from '../services/articleService';
import type { UserProfile, StyleConfig } from '../types';
import { defaultStyleConfig } from '../services/styleService';
import LoadingSpinner from './LoadingSpinner';
import Meta from './Meta';
import ArticleLimitBanner from './ArticleLimitBanner';

const StylePreview: React.FC<{ config: StyleConfig }> = ({ config }) => {
    const backgroundStyles: React.CSSProperties = {
        backgroundColor: config.custom_background_style === 'Dark' ? '#111827' : (config.custom_background_style === 'White' ? '#FFFFFF' : 'transparent'),
        color: config.custom_background_style === 'Dark' ? '#E5E7EB' : '#111827',
        borderColor: config.custom_secondary_color,
        fontFamily: config.custom_font_family,
        transition: 'all 0.3s ease',
    };
    const ctaButtonStyles: React.CSSProperties = {
        backgroundColor: config.custom_primary_color,
        fontFamily: config.custom_font_family,
        color: '#FFFFFF',
        transition: 'background-color 0.3s ease',
        border: 'none',
    };
    return (
        <div className="mt-8">
            <h3 className="text-xl font-bold text-text-primary mb-3 text-center">Style Preview</h3>
            <div style={backgroundStyles} className="p-8 rounded-lg border-2">
                <h4 style={{ fontFamily: config.custom_font_family }} className="text-xl font-bold mb-4">Sample Heading Text</h4>
                <p style={{ fontFamily: config.custom_font_family }} className="mb-6">This is sample paragraph text to demonstrate the selected font and colors.</p>
                <button style={ctaButtonStyles} className="font-bold rounded-full py-2 px-6">Example Button</button>
            </div>
        </div>
    );
};

interface SettingsPageProps {
    session: Session | null;
    initialProfile: UserProfile | null;
    initialStyleConfig: StyleConfig;
    onProfileUpdated: (profile: UserProfile) => void;
    onStyleConfigUpdated: (config: StyleConfig) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ session, initialProfile, initialStyleConfig, onProfileUpdated, onStyleConfigUpdated }) => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    // Form state
    const [styleConfig, setStyleConfig] = useState<StyleConfig>(initialStyleConfig);
    const [profile, setProfile] = useState<Partial<UserProfile>>(initialProfile || {});
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(initialProfile?.avatar_url || null);

    useEffect(() => {
        // Sync state if initial props change
        setStyleConfig(initialStyleConfig);
        setProfile(initialProfile || {});
        setAvatarPreview(initialProfile?.avatar_url || null);
    }, [initialProfile, initialStyleConfig]);

    const handleStyleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setStyleConfig(prev => ({ ...prev, [name]: value }));
    };

    const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setProfile(prev => ({ ...prev, [name]: value }));
    };

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.size > 2 * 1024 * 1024) {
                setStatusMessage('Avatar image must be smaller than 2MB.');
                return;
            }
            setAvatarFile(file);
            setAvatarPreview(URL.createObjectURL(file));
        }
    };

    const handleSave = async () => {
        if (!session?.user) {
            setStatusMessage('You must be logged in to save settings.');
            return;
        }
        setSaving(true);
        setStatusMessage('');
        try {
            let updatedProfileData = profile;

            // Handle avatar upload if a new file is selected
            if (avatarFile) {
                const safeFilename = avatarFile.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
                const path = `${session.user.id}/avatar_${Date.now()}_${safeFilename}`;
                await uploadImage(AVATARS_BUCKET_NAME, avatarFile, path);
                const publicUrl = await getPublicUrl(AVATARS_BUCKET_NAME, path);
                updatedProfileData = { ...updatedProfileData, avatar_url: publicUrl };
            }

            const [updatedProfile] = await Promise.all([
                updateUserProfile(session.user.id, updatedProfileData),
                updateUserStyleConfig(session.user.id, styleConfig)
            ]);

            // CRITICAL: Save to localStorage immediately to ensure persistence
            try {
                const savedConfig = localStorage.getItem('postgenius_config');
                const parsedConfig = savedConfig ? JSON.parse(savedConfig) : {};

                // Merge new styleConfig with existing local data (API keys, etc.)
                const newConfig = {
                    ...parsedConfig,
                    styleConfig: styleConfig
                };

                localStorage.setItem('postgenius_config', JSON.stringify(newConfig));
            } catch (e) {
                console.error("Failed to save style config to local storage", e);
            }

            onProfileUpdated(updatedProfile);
            onStyleConfigUpdated(styleConfig);

            setAvatarFile(null);
            if (avatarPreview && avatarPreview.startsWith('blob:')) {
                URL.revokeObjectURL(avatarPreview);
            }
            setAvatarPreview(updatedProfile.avatar_url);

            setStatusMessage('Settings saved successfully! Reloading...');

            // FORCE RELOAD TO APPLY CHANGES GLOBALLY AND RESET APP STATE
            setTimeout(() => {
                window.location.reload();
            }, 1000);

        } catch (error) {
            console.error(error);
            setStatusMessage('Failed to save settings.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="text-center py-16"><LoadingSpinner /></div>;
    if (!session) return <div className="text-center py-16 max-w-2xl mx-auto p-8 bg-card-bg rounded-xl"><h2 className="text-2xl font-bold text-text-headings">Authentication Required</h2><p className="text-text-secondary mt-2">Please log in to manage your settings.</p></div>;

    const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%239CA3B0'%3E%3Cpath fill-rule='evenodd' d='M18.685 19.097A9.723 9.723 0 0021.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 003.065 7.097A9.716 9.716 0 0012 21.75a9.716 9.716 0 006.685-2.653zm-12.54-1.285A7.486 7.486 0 0112 15a7.486 7.486 0 015.855 2.812A8.224 8.224 0 0112 20.25a8.224 8.224 0 01-5.855-2.438zM15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z' clip-rule='evenodd' /%3E%3C/svg%3E";

    return (
        <>
            <Meta title="Settings" description="Manage your profile and brand customization settings for Postgenius Pro." />
            <div className="max-w-4xl mx-auto p-8 bg-card-bg rounded-xl shadow-2xl border border-border-color animate-fade-in">
                <h2 className="text-4xl font-black text-text-headings mb-8 text-center"><span className="chameleon-text">Settings</span></h2>

                {/* Article Limit Banner */}
                <ArticleLimitBanner />

                <div className="space-y-12">
                    {/* --- Profile Settings --- */}
                    <section>
                        <h3 className="text-2xl font-bold text-text-headings border-b border-border-color pb-3 mb-6">Profile Settings</h3>
                        <div className="space-y-6">
                            <div className="flex items-center gap-6">
                                <img src={avatarPreview || defaultAvatar} alt="Avatar preview" className="w-24 h-24 rounded-full object-cover bg-background" />
                                <div>
                                    <label htmlFor="avatar-upload" className="cta-button cursor-pointer">
                                        Upload New Avatar
                                    </label>
                                    <input id="avatar-upload" type="file" accept="image/png, image/jpeg, image/webp" onChange={handleAvatarChange} className="sr-only" />
                                    <p className="text-xs text-text-secondary mt-2">PNG, JPG, or WEBP. Max 2MB.</p>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="full_name" className="block text-lg font-medium text-text-primary mb-2">Full Name</label>
                                <input type="text" id="full_name" name="full_name" value={profile.full_name || ''} onChange={handleProfileChange} className="w-full app-input text-lg" />
                            </div>
                            <div>
                                <label htmlFor="bio" className="block text-lg font-medium text-text-primary mb-2">Bio</label>
                                <textarea id="bio" name="bio" value={profile.bio || ''} onChange={handleProfileChange} rows={3} className="w-full app-input text-lg resize-y" />
                            </div>
                        </div>
                    </section>

                    {/* --- Brand Customization --- */}
                    <section>
                        <h3 className="text-2xl font-bold text-text-headings border-b border-border-color pb-3 mb-6">Brand Customization</h3>
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div>
                                    <label htmlFor="custom_primary_color" className="block text-lg font-medium text-text-primary mb-2">Primary Color (CTAs)</label>
                                    <div className="relative flex items-center">
                                        <input type="color" id="custom_primary_color" name="custom_primary_color" value={styleConfig.custom_primary_color} onChange={handleStyleChange} className="absolute left-2 p-1 h-10 w-10 block bg-transparent border-0 cursor-pointer" />
                                        <input type="text" value={styleConfig.custom_primary_color} onChange={handleStyleChange} name="custom_primary_color" className="w-full app-input text-lg pl-14" />
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="custom_secondary_color" className="block text-lg font-medium text-text-primary mb-2">Secondary Color (Accents)</label>
                                    <div className="relative flex items-center">
                                        <input type="color" id="custom_secondary_color" name="custom_secondary_color" value={styleConfig.custom_secondary_color} onChange={handleStyleChange} className="absolute left-2 p-1 h-10 w-10 block bg-transparent border-0 cursor-pointer" />
                                        <input type="text" value={styleConfig.custom_secondary_color} onChange={handleStyleChange} name="custom_secondary_color" className="w-full app-input text-lg pl-14" />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="custom_background_style" className="block text-lg font-medium text-text-primary mb-2">Article Background Style</label>
                                <select id="custom_background_style" name="custom_background_style" value={styleConfig.custom_background_style} onChange={handleStyleChange} className="w-full app-input text-lg">
                                    <option value="White">White (Standard)</option>
                                    <option value="Dark">Dark Mode</option>
                                    <option value="Transparent">Transparent</option>
                                </select>
                            </div>
                            <div>
                                <label htmlFor="custom_font_family" className="block text-lg font-medium text-text-primary mb-2">Font Family</label>
                                <input type="text" id="custom_font_family" name="custom_font_family" value={styleConfig.custom_font_family} onChange={handleStyleChange} placeholder="'Roboto', sans-serif" className="w-full app-input text-lg" />
                            </div>
                        </div>
                        <StylePreview config={styleConfig} />
                    </section>

                    {/* --- Stock Image Settings --- */}
                    <section>
                        <h3 className="text-2xl font-bold text-text-headings border-b border-border-color pb-3 mb-6">Real Image Integrations (Stock Photos)</h3>
                        <p className="text-sm text-text-secondary mb-4">
                            Connect your free accounts to access millions of high-quality, real photos for your articles.
                            If enabled, the system will prioritize real photos for "Steps" and "Ingredients".
                        </p>
                        <div className="space-y-6">
                            <div>
                                <label htmlFor="stockImageProvider" className="block text-lg font-medium text-text-primary mb-2">Primary Provider</label>
                                <select
                                    id="stockImageProvider"
                                    name="stockImageProvider"
                                    value={styleConfig.stockImageProvider || 'none'}
                                    onChange={(e) => setStyleConfig(prev => ({ ...prev, stockImageProvider: e.target.value as any }))}
                                    className="w-full app-input text-lg"
                                >
                                    <option value="none">Disabled (Use AI Only)</option>
                                    <option value="pexels">Pexels (Recommended for Food/Travel)</option>
                                    <option value="unsplash">Unsplash (High Quality)</option>
                                    <option value="pixabay">Pixabay (Vectors & Photos)</option>
                                </select>
                            </div>

                            {/* Pexels Key */}
                            {styleConfig.stockImageProvider === 'pexels' && (
                                <div className="animate-fade-in">
                                    <label htmlFor="pexelsApiKey" className="block text-lg font-medium text-text-primary mb-2">Pexels API Key</label>
                                    <input
                                        type="password"
                                        id="pexelsApiKey"
                                        name="pexelsApiKey"
                                        value={styleConfig.pexelsApiKey || ''}
                                        onChange={handleStyleChange}
                                        placeholder="Paste your Pexels Key here"
                                        className="w-full app-input text-lg"
                                    />
                                    <a href="https://www.pexels.com/api/" target="_blank" rel="noreferrer" className="text-xs text-accent mt-1 hover:underline">Get Free Key</a>
                                </div>
                            )}

                            {/* Unsplash Key */}
                            {styleConfig.stockImageProvider === 'unsplash' && (
                                <div className="animate-fade-in">
                                    <label htmlFor="unsplashApiKey" className="block text-lg font-medium text-text-primary mb-2">Unsplash Access Key</label>
                                    <input
                                        type="password"
                                        id="unsplashApiKey"
                                        name="unsplashApiKey"
                                        value={styleConfig.unsplashApiKey || ''}
                                        onChange={handleStyleChange}
                                        placeholder="Paste your Unsplash Access Key"
                                        className="w-full app-input text-lg"
                                    />
                                    <a href="https://unsplash.com/developers" target="_blank" rel="noreferrer" className="text-xs text-accent mt-1 hover:underline">Get Free Key</a>
                                </div>
                            )}

                            {/* Pixabay Key */}
                            {styleConfig.stockImageProvider === 'pixabay' && (
                                <div className="animate-fade-in">
                                    <label htmlFor="pixabayApiKey" className="block text-lg font-medium text-text-primary mb-2">Pixabay API Key</label>
                                    <input
                                        type="password"
                                        id="pixabayApiKey"
                                        name="pixabayApiKey"
                                        value={styleConfig.pixabayApiKey || ''}
                                        onChange={handleStyleChange}
                                        placeholder="Paste your Pixabay Key"
                                        className="w-full app-input text-lg"
                                    />
                                    <a href="https://pixabay.com/api/docs/" target="_blank" rel="noreferrer" className="text-xs text-accent mt-1 hover:underline">Get Free Key</a>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* --- Extraction Engine --- */}
                    <section>
                        <h3 className="text-2xl font-bold text-text-headings border-b border-border-color pb-3 mb-6">Extraction Engine (Hashbrown.dev) 🥔</h3>
                        <p className="text-sm text-text-secondary mb-4">
                            Enable Hashbrown.dev "Extraction Gateway" to intelligently parse recipes from any URL.
                        </p>
                        <div className="space-y-6">
                            <div className="animate-fade-in">
                                <label htmlFor="hashbrownApiKey" className="block text-lg font-medium text-text-primary mb-2">Hashbrown API Key</label>
                                <input
                                    type="password"
                                    id="hashbrownApiKey"
                                    name="hashbrownApiKey"
                                    value={styleConfig.hashbrownApiKey || ''}
                                    onChange={handleStyleChange}
                                    placeholder="Paste your Hashbrown Key"
                                    className="w-full app-input text-lg"
                                />
                                <a href="https://hashbrown.dev" target="_blank" rel="noreferrer" className="text-xs text-accent mt-1 hover:underline">Get Key from Hashbrown.dev</a>
                            </div>
                        </div>
                    </section>
                </div>

                <div className="mt-12 border-t border-border-color pt-6">
                    <button onClick={handleSave} disabled={saving} className="w-full save-button text-lg flex items-center justify-center">
                        {saving ? <LoadingSpinner /> : 'Save All Settings'}
                    </button>
                    {statusMessage && <p className={`text-sm text-center mt-3 ${statusMessage.includes('Failed') ? 'text-red-400' : 'text-green-400'}`}>{statusMessage}</p>}
                </div>
            </div>
        </>
    );
};

export default SettingsPage;
