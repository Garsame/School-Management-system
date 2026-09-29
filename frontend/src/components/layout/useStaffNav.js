import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { activePathFor, buildStaffMenu, findActiveSection, flattenMenu } from '../../config/staffMenu';

/**
 * One person's menu plus where they are in it. Shared by the staff frame and the teacher
 * portal, so the sidebar link that lights up and the tabs above the page always agree.
 */
const useStaffNav = (user) => {
    const { pathname } = useLocation();
    const menu = useMemo(() => buildStaffMenu(user), [user]);
    const allItems = useMemo(() => flattenMenu(menu.groups), [menu]);
    const activePath = activePathFor(pathname, allItems);
    const activeSection = useMemo(() => findActiveSection(menu.groups, activePath), [menu, activePath]);

    return { ...menu, allItems, activePath, activeSection };
};

export default useStaffNav;
