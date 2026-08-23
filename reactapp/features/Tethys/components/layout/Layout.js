import { Routes, Route, NavLink } from 'react-router-dom';
import Nav            from 'react-bootstrap/Nav';
import PropTypes      from 'prop-types';
import { useState, useContext, startTransition } from 'react';
import { LinkContainer } from 'react-router-bootstrap';

import Header   from 'features/Tethys/components/layout/Header';
import NavMenu  from 'features/Tethys/components/layout/NavMenu';
import NotFound from 'features/Tethys/components/error/NotFound';
import { AppContext } from 'features/Tethys/context/context';
import { SkipLink, VisuallyHidden } from 'features/DataStream/components/styles/Styles';

const isExternal = (to, externalFlag) =>
  externalFlag ?? /^https?:\/\//i.test(to);      // auto-detect absolute URLs

export default function Layout({ navLinks = [], routes = [], children }) {
  const { tethysApp } = useContext(AppContext);
  const [navVisible, setNavVisible] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(true);

  /** Close the off-canvas smoothly */
  const closeNav = () => startTransition(() => setNavVisible(false));

  return (
    // A flex column, so the map takes what is left rather than a full 100% on top of whatever
    // the banner occupies. With height: 100% on both, the banner pushed the map 52px past the
    // bottom of the window and took the attribution control off screen with it.
    <div className="h-100 d-flex flex-column">
      {/* First in the tab order on purpose: the nav, the banner and its dismiss button sit
          between the header and the map, and without this every page load costs a keyboard
          reader three stops before they reach anything they came for. */}
      <SkipLink href="#main-content">Skip to the map</SkipLink>

      <Header onNavChange={setNavVisible} />

      {bannerVisible && (
        <div className="experimental-banner" role="status" aria-live="polite">
          <div className="experimental-banner__content">
            <strong>Experimental Streamflow Predictions:</strong> These results are preliminary and may not represent accurate forecasts.
          </div>
          <button
            type="button"
            className="experimental-banner__close"
            aria-label="Dismiss experimental streamflow warning"
            onClick={() => setBannerVisible(false)}
          >
            ×
          </button>
        </div>
      )}

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
