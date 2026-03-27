import React from 'react';
import Meta from './Meta';
import PublicPageShell, { PublicPanel } from './PublicPageShell';

const SocialLink: React.FC<{ href: string; children: React.ReactNode; label: string }> = ({ href, children, label }) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className="text-[#6b5a73] hover:text-[#7a477a] transition-colors"
    >
        {children}
    </a>
);

const AboutPage: React.FC = () => {
    return (
        <>
            <Meta
                title="About Postgenius Pro"
                description="Learn how Postgenius Pro publishes trusted product reviews, clear comparisons, and practical buying guides for smarter shopping decisions."
            />

            <PublicPageShell
                eyebrow="About Postgenius Pro"
                title="A soft editorial experience built for serious product decisions."
                description="Postgenius Pro is designed to feel welcoming and easy to browse, while still behaving like a structured review publication for readers comparing products across many Amazon niches."
                badges={['Trusted Reviews', 'Comparisons', 'Buying Guides']}
                aside={
                    <PublicPanel className="bg-white/88">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7a477a]">Editorial Focus</p>
                        <h2 className="mt-3 text-2xl font-black leading-tight text-[#402247]">Coverage that helps readers move from discovery to confident purchase decisions.</h2>
                        <p className="mt-4 text-sm leading-relaxed text-[#6b5a73]">
                            We cover kitchen gear, electronics, home essentials, deals, and other product categories through practical editorial structure rather than aggressive marketplace design.
                        </p>
                    </PublicPanel>
                }
            >
                <PublicPanel>
                    <section id="about-app" className="mb-10">
                        <h2 className="text-4xl font-black text-[#402247]">Our Mission</h2>
                        <p className="mt-4 text-lg leading-relaxed text-[#6b5a73]">
                            Postgenius Pro is an editorial review publication built for readers who want better product decisions.
                        </p>
                        <p className="mt-4 text-lg font-medium leading-relaxed text-[#4d3754]">
                            We focus on trusted reviews, practical comparisons, and clear buying guidance that help shoppers move from research to confident action.
                        </p>
                    </section>

                    <section id="editorial-standards" className="mb-10 border-t border-[#f0e3ec] pt-10">
                        <h2 className="text-4xl font-black text-[#402247]">Editorial Standards</h2>
                        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-[#6b5a73]">
                            Every recommendation is structured to prioritize clarity, product context, and reader trust before it reaches publication.
                        </p>
                        <div className="mt-8 grid gap-4 md:grid-cols-3">
                            {[
                                ['Experience', 'Recommendations are built around real usage scenarios and buyer intent.'],
                                ['Expertise', 'Product claims are checked against trusted technical and commercial references.'],
                                ['Trust', 'Affiliate relationships and sponsored placements are clearly disclosed.'],
                            ].map(([title, copy]) => (
                                <div key={title} className="rounded-[1.6rem] border border-[#ebdae8] bg-gradient-to-br from-[#fff7fb] to-[#f7fbff] p-5">
                                    <h3 className="text-lg font-bold text-[#402247]">{title}</h3>
                                    <p className="mt-3 text-sm leading-relaxed text-[#6b5a73]">{copy}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section id="monetization-policy" className="mb-10 border-t border-[#f0e3ec] pt-10">
                        <h2 className="text-4xl font-black text-[#402247]">Transparent Monetization</h2>
                        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-[#6b5a73]">
                            We monetize through affiliate links and select advertising placements, but our editorial recommendations are organized around reader value first.
                        </p>
                        <div className="mt-8 rounded-[1.8rem] border border-[#ebdae8] bg-gradient-to-br from-[#fff9fd] to-[#f4fbff] p-7">
                            <h3 className="text-xl font-bold text-[#402247]">Reader Trust Comes First</h3>
                            <p className="mt-3 text-base leading-relaxed text-[#6b5a73]">
                                Our long-term approach is simple: publish reliable guidance, keep comparisons useful, and earn repeat visits through consistency.
                            </p>
                        </div>
                    </section>

                    <section id="about-creator" className="border-t border-[#f0e3ec] pt-10">
                        <h2 className="text-4xl font-black text-[#402247]">About the Creator</h2>
                        <div className="mt-8 flex flex-col items-center gap-8 rounded-[2rem] border border-[#ebdae8] bg-gradient-to-br from-[#fff7fb] to-[#f2f9ff] p-8 text-center sm:flex-row sm:text-left">
                            <img
                                src="https://avatars.githubusercontent.com/u/125867037?s=400&u=797f12dedad1e61cab76bb8137306faacc08c6b5&v=4"
                                alt="A portrait of Aboudi Larbi, the creator of Postgenius Pro."
                                className="h-40 w-40 rounded-full border-4 border-white object-cover shadow-[0_18px_34px_rgba(90,49,96,0.14)]"
                            />
                            <div>
                                <h3 className="text-2xl font-bold text-[#402247]">Aboudi Larbi</h3>
                                <p className="mt-1 text-sm font-semibold uppercase tracking-[0.16em] text-[#7a477a]">Founder | Editorial Systems | Digital Growth</p>
                                <p className="mt-4 max-w-lg leading-relaxed text-[#6b5a73]">
                                    Aboudi builds focused editorial properties that turn clear product guidance into long-term audience trust.
                                </p>
                                <div className="mt-6 flex items-center justify-center gap-5 sm:justify-start">
                                    <SocialLink href="https://github.com/larbilife" label="Aboudi Larbi on GitHub">
                                        <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.168 6.839 9.492.5.092.682-.217.682-.482 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.031-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.03 1.595 1.03 2.688 0 3.848-2.338 4.695-4.566 4.942.359.308.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.001 10.001 0 0022 12c0-5.523-4.477-10-10-10z" clipRule="evenodd" /></svg>
                                    </SocialLink>
                                    <SocialLink href="https://www.linkedin.com/in/larbiaboudi/" label="Aboudi Larbi on LinkedIn">
                                        <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" /></svg>
                                    </SocialLink>
                                    <SocialLink href="https://x.com/larbi_aboudi" label="Aboudi Larbi on X">
                                        <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 1200 1227" aria-hidden="true"><path d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.31H892.476L569.165 687.854V687.828Z" /></svg>
                                    </SocialLink>
                                </div>
                            </div>
                        </div>
                    </section>
                </PublicPanel>
            </PublicPageShell>
        </>
    );
};

export default AboutPage;
