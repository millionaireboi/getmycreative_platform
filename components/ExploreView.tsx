import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { UITemplate } from '../types.ts';
import { getPublishedTemplates } from '../core/systems/templateStore.ts';
import { ALL_TAGS, TEMPLATE_BUNDLES, TemplateBundle } from '../constants.ts';
import { TemplateDetailModal } from './TemplateDetailModal.tsx';
import { 
    SparklesIcon, 
    ChevronLeftIcon, 
    ChevronRightIcon, 
    UsersIcon, 
    DollarSignIcon, 
    TrendingUpIcon, 
    HomeIcon, 
    PaletteIcon,
    LayoutGridIcon,
    XIcon
} from './icons.tsx';


const TemplateCard = ({ template, onSelect }: { template: UITemplate, onSelect: (template: UITemplate) => void }) => (
    <div
      className="group relative break-inside-avoid mb-4 cursor-pointer"
      onClick={() => onSelect(template)}
    >
      <img
        src={template.imageUrl}
        alt={template.title}
        className="w-full rounded-xl shadow-md transition-all duration-300 group-hover:shadow-xl"
      />
      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-300 rounded-xl flex items-end p-4">
        <p className="text-white text-lg font-bold opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
          {template.title}
        </p>
      </div>
    </div>
);

const BundleCard = ({ bundle, onSelect }: { bundle: TemplateBundle, onSelect: (bundle: TemplateBundle) => void }) => (
    <div onClick={() => onSelect(bundle)} className="flex-shrink-0 w-72 h-40 rounded-xl overflow-hidden relative group cursor-pointer shadow-lg hover:shadow-2xl transition-shadow duration-300">
        <img src={bundle.coverUrl} alt={bundle.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex flex-col justify-end p-4">
            <h3 className="text-white font-bold text-lg">{bundle.title}</h3>
            <p className="text-white/80 text-sm">{bundle.description}</p>
        </div>
    </div>
);

const categoryIcons: { [key: string]: React.ReactElement } = {
    "All": <LayoutGridIcon className="w-5 h-5" />,
    "Social Media": <UsersIcon className="w-5 h-5" />,
    "E-commerce": <DollarSignIcon className="w-5 h-5" />,
    "Sale": <TrendingUpIcon className="w-5 h-5" />,
    "Minimalist": <LayoutGridIcon className="w-5 h-5" />,
    "Bold": <SparklesIcon className="w-5 h-5" />,
    "Corporate": <HomeIcon className="w-5 h-5" />,
    "Abstract": <PaletteIcon className="w-5 h-5" />,
};

const CategoryButton = ({ isSticky, tag, activeTag, onClick }: { isSticky: boolean, tag: string, activeTag: string | null, onClick: () => void }) => {
    const isActive = (tag === 'All' && activeTag === null) || activeTag === tag;
    const icon = categoryIcons[tag] || <LayoutGridIcon className="w-5 h-5" />;

    if (isSticky) {
        return (
            <button 
                onClick={onClick}
                className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-full transition whitespace-nowrap ${isActive ? 'bg-emerald-500 text-white' : 'bg-white text-gray-700 hover:bg-slate-200 border border-slate-200'}`}
            >
                {React.cloneElement(icon, { className: 'w-4 h-4' })}
                <span>{tag}</span>
            </button>
        );
    }

    return (
        <button 
            onClick={onClick}
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 text-center font-semibold transition-colors h-full ${isActive ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : 'bg-white border-slate-200 text-gray-700 hover:bg-slate-50'}`}
        >
            <div className={`p-3 rounded-full ${isActive ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                {React.cloneElement(icon, { className: 'w-6 h-6' })}
            </div>
            <span className="text-sm">{tag}</span>
        </button>
    );
};

const TEMPLATES_PER_PAGE = 20;

interface ExploreViewProps {
    onSelectTemplate: (template: UITemplate) => void;
    searchQuery: string;
    aiTags: string[];
}

export const ExploreView = ({ onSelectTemplate, searchQuery, aiTags }: ExploreViewProps) => {
    const [allTemplates, setAllTemplates] = useState<UITemplate[]>([]);
    const [visibleCount, setVisibleCount] = useState(TEMPLATES_PER_PAGE);
    const [detailTemplate, setDetailTemplate] = useState<UITemplate | null>(null);
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const [activeBundle, setActiveBundle] = useState<TemplateBundle | null>(null);
    const [isCategoriesSticky, setIsCategoriesSticky] = useState(false);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);

    const bundleContainerRef = useRef<HTMLDivElement>(null);
    const categorySectionRef = useRef<HTMLDivElement>(null);
    const viewContainerRef = useRef<HTMLDivElement>(null);
    const categoryScrollRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLElement | null>(null);
    const [categoryCanScrollLeft, setCategoryCanScrollLeft] = useState(false);
    const [categoryCanScrollRight, setCategoryCanScrollRight] = useState(false);

    useEffect(() => {
        const loadTemplates = async () => {
            const templates = await getPublishedTemplates();
            setAllTemplates(templates as UITemplate[]);
        };
        loadTemplates();
    }, []);

    const aiTagSignature = useMemo(() => aiTags.join('|'), [aiTags]);

    useEffect(() => {
        scrollContainerRef.current = viewContainerRef.current?.parentElement ?? null;
    }, []);

    const resetFeed = useCallback(() => {
        setVisibleCount(TEMPLATES_PER_PAGE);
        const scrollableParent = scrollContainerRef.current ?? viewContainerRef.current?.parentElement ?? null;
        if (scrollableParent) {
            scrollableParent.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, []);

    useEffect(() => {
        // Search takes precedence over bundle selection
        if ((searchQuery || aiTags.length > 0) && activeBundle) {
            setActiveBundle(null);
        }
    }, [searchQuery, aiTags, activeBundle]);

    const previousSearchRef = useRef(searchQuery);
    useEffect(() => {
        if (previousSearchRef.current !== searchQuery) {
            previousSearchRef.current = searchQuery;
            resetFeed();
        }
    }, [searchQuery, resetFeed]);

    const { visibleTemplates, hasMore } = useMemo(() => {
        const fullFilteredList = allTemplates
            .filter(t => activeBundle ? activeBundle.templateIds.includes(t.id) : true)
            .filter(t => activeTag ? t.tags.includes(activeTag) : true)
            .filter(t => {
                if (aiTags.length > 0) {
                    const templateTagsLower = t.tags.map(tag => tag.toLowerCase());
                    const aiTagsLower = aiTags.map(tag => tag.toLowerCase());
                    return aiTagsLower.some(aiTag => templateTagsLower.includes(aiTag));
                }
                if (searchQuery) {
                    return t.title.toLowerCase().includes(searchQuery.toLowerCase());
                }
                return true;
            });
        
        const visible = fullFilteredList.slice(0, visibleCount);
        const more = visibleCount < fullFilteredList.length;
        return { visibleTemplates: visible, hasMore: more };
    }, [allTemplates, activeTag, activeBundle, visibleCount, searchQuery, aiTagSignature]);
    
    const handleCategoryClick = (tag: string | null) => {
        const isSameSelection = tag === activeTag && !activeBundle;
        if (isSameSelection) return;

        setActiveTag(tag);
        setActiveBundle(null); // Reset bundle when category changes
        resetFeed();
    };
    
    const handleBundleSelect = (bundle: TemplateBundle) => {
        if (activeBundle?.title === bundle.title) return;

        setActiveBundle(bundle);
        setActiveTag(null); // Reset category when bundle is selected
        resetFeed();
    };

    const handleBundleScroll = useCallback(() => {
        const el = bundleContainerRef.current;
        if (el) {
            const isAtStart = el.scrollLeft < 10;
            const isAtEnd = el.scrollWidth - el.scrollLeft - el.clientWidth < 10;
            setCanScrollLeft(!isAtStart);
            setCanScrollRight(!isAtEnd);
        }
    }, []);

    const scrollBundles = (direction: 'left' | 'right') => {
        const el = bundleContainerRef.current;
        if (el) {
            const scrollAmount = el.clientWidth * 0.8;
            el.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
        }
    };

    const scrollCategories = (direction: 'left' | 'right') => {
        const el = categoryScrollRef.current;
        if (el) {
            const scrollAmount = el.clientWidth * 0.8;
            el.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
        }
    };

    useEffect(() => {
        const el = bundleContainerRef.current;
        if (el) {
            el.addEventListener('scroll', handleBundleScroll);
            handleBundleScroll();
            return () => el.removeEventListener('scroll', handleBundleScroll);
        }
    }, [handleBundleScroll]);

    useEffect(() => {
        const scrollableParent = viewContainerRef.current?.parentElement;
        const categorySection = categorySectionRef.current;

        if (!scrollableParent || !categorySection) return;
        
        const offsetTop = categorySection.offsetTop;
        const handleScroll = () => {
            setIsCategoriesSticky(scrollableParent.scrollTop > offsetTop);
        };

        scrollableParent.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
        return () => scrollableParent.removeEventListener('scroll', handleScroll);
    }, [allTemplates]);

    useEffect(() => {
        if (!isCategoriesSticky) {
            setCategoryCanScrollLeft(false);
            setCategoryCanScrollRight(false);
            return;
        }

        const el = categoryScrollRef.current;
        if (!el) return;

        const updateCategoryScroll = () => {
            const isAtStart = el.scrollLeft < 8;
            const isAtEnd = el.scrollWidth - el.scrollLeft - el.clientWidth < 8;
            setCategoryCanScrollLeft(!isAtStart);
            setCategoryCanScrollRight(!isAtEnd);
        };

        el.addEventListener('scroll', updateCategoryScroll);
        updateCategoryScroll();

        return () => {
            el.removeEventListener('scroll', updateCategoryScroll);
        };
    }, [isCategoriesSticky, activeTag]);

    useEffect(() => {
        if (!hasMore) return;
        const sentinelEl = sentinelRef.current;
        if (!sentinelEl) return;

        const rootEl = viewContainerRef.current?.parentElement ?? null;
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    observer.unobserve(entry.target);
                    setVisibleCount(prev => prev + TEMPLATES_PER_PAGE);
                }
            });
        }, { root: rootEl, rootMargin: '200px 0px' });

        observer.observe(sentinelEl);

        return () => observer.disconnect();
    }, [hasMore, visibleCount]);

    const handleManualLoadMore = useCallback(() => {
        setVisibleCount(prev => prev + TEMPLATES_PER_PAGE);
    }, []);

    const handleConfirmSelection = (template: UITemplate) => {
        onSelectTemplate(template);
        setDetailTemplate(null);
    };
    
    const renderActiveFilterHeader = () => {
        if (activeBundle) {
            return (
                <div className="flex items-center justify-between bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                    <p className="font-medium text-emerald-800">Viewing templates from <strong>{activeBundle.title}</strong></p>
                    <button onClick={() => setActiveBundle(null)} className="flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-900">
                        <XIcon className="w-4 h-4" /> Clear
                    </button>
                </div>
            );
        }
        return null;
    };

    return (
        <div ref={viewContainerRef} className="container mx-auto px-4 py-8">
            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
            <header className="text-center mb-12">
                <h1 className="text-5xl font-extrabold text-gray-800 tracking-tight font-display">What would you like to create today?</h1>
            </header>

            {TEMPLATE_BUNDLES.length > 0 && (
                <section className="mb-12 relative">
                    <h2 className="text-2xl font-bold mb-4 px-1">Trending Bundles</h2>
                    {canScrollLeft && (
                        <button onClick={() => scrollBundles('left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-md hover:bg-white transition-all">
                            <ChevronLeftIcon className="w-6 h-6" />
                        </button>
                    )}
                    <div ref={bundleContainerRef} className="flex gap-4 overflow-x-auto pb-4 no-scrollbar scroll-smooth">
                       {TEMPLATE_BUNDLES.map(bundle => (
                           <BundleCard key={bundle.title} bundle={bundle} onSelect={handleBundleSelect} />
                       ))}
                    </div>
                    {canScrollRight && (
                        <button onClick={() => scrollBundles('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-md hover:bg-white transition-all">
                            <ChevronRightIcon className="w-6 h-6" />
                        </button>
                    )}
                </section>
            )}
            
            <section ref={categorySectionRef} className={`transition-all duration-300 ${isCategoriesSticky ? 'sticky top-0 z-10 bg-slate-100/90 backdrop-blur-md -mx-4' : ''}`}>
                <div className="container mx-auto px-4">
                    <h2 className={isCategoriesSticky ? 'sr-only' : 'text-2xl font-bold mb-4'}>Categories</h2>
                    <div className="relative">
                        {isCategoriesSticky && categoryCanScrollLeft && (
                            <button
                                onClick={() => scrollCategories('left')}
                                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1.5 bg-white/90 backdrop-blur rounded-full shadow hover:bg-white transition"
                            >
                                <ChevronLeftIcon className="w-5 h-5" />
                            </button>
                        )}
                        <div
                            ref={categoryScrollRef}
                            className={isCategoriesSticky ? 'flex gap-2 overflow-x-auto py-3 px-8 no-scrollbar' : 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4'}
                        >
                            <CategoryButton isSticky={isCategoriesSticky} tag="All" activeTag={activeTag} onClick={() => handleCategoryClick(null)} />
                            {ALL_TAGS.map(tag => (
                               <CategoryButton key={tag} isSticky={isCategoriesSticky} tag={tag} activeTag={activeTag} onClick={() => handleCategoryClick(tag)} />
                            ))}
                        </div>
                        {isCategoriesSticky && categoryCanScrollRight && (
                            <button
                                onClick={() => scrollCategories('right')}
                                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1.5 bg-white/90 backdrop-blur rounded-full shadow hover:bg-white transition"
                            >
                                <ChevronRightIcon className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>
            </section>

            <section className="mt-8">
                 <div className="flex justify-between items-center mb-4 px-1">
                    <h2 className="text-2xl font-bold">{activeBundle ? activeBundle.title : (activeTag ? `${activeTag} Templates` : 'All Templates')}</h2>
                 </div>
                 {renderActiveFilterHeader()}
                 
                 {visibleTemplates.length > 0 ? (
                    <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 mt-4">
                        {visibleTemplates.map(template => (
                           <TemplateCard key={template.id} template={template} onSelect={setDetailTemplate} />
                        ))}
                    </div>
                 ) : (
                    <div className="text-center py-16">
                        <p className="text-gray-500">No templates found. Try a different search or filter.</p>
                    </div>
                 )}
                 {hasMore && (
                     <>
                         <div ref={sentinelRef} className="h-1" />
                         <div className="text-center mt-8">
                             <button onClick={handleManualLoadMore} className="px-6 py-3 bg-white border border-slate-300 rounded-lg font-semibold hover:bg-slate-50 transition-colors">
                                Load More
                             </button>
                         </div>
                     </>
                 )}
            </section>

             {detailTemplate && (
                <TemplateDetailModal 
                    template={detailTemplate}
                    onUseTemplate={handleConfirmSelection}
                    onClose={() => setDetailTemplate(null)}
                />
            )}
        </div>
    );
};
