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
  externalFlag ?? /^https?:\/\//i.test(to);

/** The page around the map: header, off-canvas nav, and the first-run notice. */
export default function Layout({ navLinks = [], routes = [], children }) {
  const { tethysApp } = useContext(AppContext);
  const [navVisible, setNavVisible] = useState(false);
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
      external:  PropTypes.bool,
    })
  ),
  routes:   PropTypes.arrayOf(PropTypes.node),
  children: PropTypes.oneOfType([
    PropTypes.arrayOf(PropTypes.element),
    PropTypes.element,
  ]),
};
