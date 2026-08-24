import { Routes, Route } from 'react-router-dom';
import Nav            from 'react-bootstrap/Nav';
import PropTypes      from 'prop-types';
import { useState, useContext, startTransition } from 'react';
import { LinkContainer } from 'react-router-bootstrap';

import Header   from 'features/Tethys/components/layout/Header';
import NavMenu  from 'features/Tethys/components/layout/NavMenu';
import NotFound from 'features/Tethys/components/error/NotFound';
import { AppContext } from 'features/Tethys/context/context';
import { SkipLink, VisuallyHidden } from 'features/DataStream/components/styles/Styles';
import { ExperimentalNoticeModal } from 'features/DataStream/components/Modals';
import {
  acknowledgeExperimental,
  hasAcknowledgedExperimental,
} from 'features/DataStream/lib/firstRun';

const isExternal = (to, externalFlag) =>
  externalFlag ?? /^https?:\/\//i.test(to);      // auto-detect absolute URLs

/**
 * The page around the map: header, off-canvas nav, and the first-run notice.
 *
 * The notice is read once at mount rather than on every render. Re-reading it would reopen the
 * dialog on any re-render that follows a storage failure, which is the one case where the
 * acknowledgement cannot be recorded -- so the reader who can least escape it would see it most.
 *
 * The outer element is a flex column because the map has to take whatever is left rather than a
 * full 100% of its own. With height: 100% on both, the banner that preceded this modal pushed
 * the map 52px past the bottom of the window and took the attribution control off screen.
 *
 * The skip link comes first in the tab order on purpose: the nav, the notice and its dismiss
 * button all sit between the header and the map, so without it every page load costs a keyboard
 * reader three stops before they reach anything they came for.
 */
export default function Layout({ navLinks = [], routes = [], children }) {
  const { tethysApp } = useContext(AppContext);
  const [navVisible, setNavVisible] = useState(false);
  // Read once at mount, for the reason in the docstring.
  const [noticeOpen, setNoticeOpen] = useState(() => !hasAcknowledgedExperimental());

  const acknowledgeNotice = () => {
    acknowledgeExperimental();
    setNoticeOpen(false);
  };

  /** Close the off-canvas smoothly */
  const closeNav = () => startTransition(() => setNavVisible(false));

  return (
    <div className="h-100 d-flex flex-column">
      <ExperimentalNoticeModal show={noticeOpen} onAcknowledge={acknowledgeNotice} />

      <SkipLink href="#main-content">Skip to the map</SkipLink>

      <Header onNavChange={setNavVisible} />


      <NavMenu navTitle="Main Menu" navVisible={navVisible} onNavChange={setNavVisible}>
        <Nav variant="pills"
             defaultActiveKey={tethysApp.rootUrl}
             className="flex-column">

          {navLinks.map(({ title, to, eventKey, external }, idx) =>
            isExternal(to, external) ? (
              
              <Nav.Link
                as="a"
                href={to}
                eventKey={eventKey}
                key={`ext-${idx}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeNav}
              >
                {title}
              </Nav.Link>
            ) : (
              
              <LinkContainer to={to} key={`int-${idx}`} onClick={closeNav}>
                <Nav.Link eventKey={eventKey}>{title}</Nav.Link>
              </LinkContainer>
            )
          )}
        </Nav>

      </NavMenu>

      {/* The app had no main landmark and no h1. Both existed only on the error page, so a
          screen reader had nothing to jump to and the heading tree started at h2. The heading is
          hidden rather than absent: this design has no visible headline by choice, the largest
          type in it being 18px, but the document still needs a name. */}
      <main id="main-content" className="h-100 d-flex flex-column" style={{ minHeight: 0 }}>
        <VisuallyHidden>{tethysApp.title}</VisuallyHidden>

        <Routes>
          {routes}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      {children}
    </div>
  );
}

/* -------------------- PropTypes -------------------- */
Layout.propTypes = {
  navLinks: PropTypes.arrayOf(
    PropTypes.shape({
      title:     PropTypes.string.isRequired,
      to:        PropTypes.string.isRequired,
      eventKey:  PropTypes.string,
      external:  PropTypes.bool,          // <- NEW (optional)
    })
  ),
  routes:   PropTypes.arrayOf(PropTypes.node),
  children: PropTypes.oneOfType([
    PropTypes.arrayOf(PropTypes.element),
    PropTypes.element,
  ]),
};
