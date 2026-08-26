import PropTypes from 'prop-types';
import { useState, useEffect } from 'react';
import styled from 'styled-components';

import Spinner from 'features/Tethys/components/loader/Spinner';

const Screen = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  background-color: var(--background-color);
  color: var(--panel-text-muted);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
`;

/** The boot screen, shown while the app asks Tethys who it is and who is using it. */
const LoadingAnimation = ({ delay }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => setShow(true), Number(delay) || 0);
    return () => clearTimeout(timeoutId);
  }, [delay]);

  if (!show) return null;

  return (
    <Screen>
      <Spinner size={40} thickness={3} label="Loading NGIAB-NRDS" />
      <span>Loading</span>
    </Screen>
  );
};

LoadingAnimation.propTypes = {
  delay: PropTypes.number,
};

export default LoadingAnimation;
