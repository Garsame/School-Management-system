import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

/**
 * The pages inside one sidebar section, shown as tabs above the page. The sidebar keeps a
 * single short link per section; these tabs are how a person moves between its pages.
 * `section` comes from findActiveSection in config/staffMenu.js.
 */
const SectionTabs = ({ section, activePath }) => {
    const barRef = useRef(null);
    const pages = section?.item.children || [];

    // On a phone the bar scrolls sideways, so bring the current tab into view. Tab widths
    // change once the web font loads, so measure again then.
    useEffect(() => {
        const centerCurrentTab = () => {
            const bar = barRef.current;
            const current = bar?.querySelector('[aria-current="page"]');
            if (!bar || !current) return;
            bar.scrollLeft = Math.max(0, current.offsetLeft - (bar.clientWidth - current.offsetWidth) / 2);
        };
        centerCurrentTab();
        document.fonts?.ready.then(centerCurrentTab);
    }, [section?.key, activePath]);

    // One page is not a choice, so there is nothing to switch between.
    if (pages.length < 2) return null;

    return (
        <nav ref={barRef} className="section-tabs" aria-label={section.item.label}>
            {pages.map((page) => {
                const isActive = page.path === activePath;
                return (
                    <Link
                        key={page.path}
                        to={page.path}
                        className={`section-tab${isActive ? ' section-tab-active' : ''}`}
                        aria-current={isActive ? 'page' : undefined}
                    >
                        <page.icon size={15} />
                        <span>{page.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
};

export default SectionTabs;
