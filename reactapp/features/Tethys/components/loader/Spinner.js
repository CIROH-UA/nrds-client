import PropTypes from 'prop-types';
import styled, { keyframes } from 'styled-components';

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

/** One ring with a gap in it, turning. */
const Ring = styled.span`
  display: inline-block;
  flex: none;
  box-sizing: border-box;
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  border: ${({ $thickness }) => $thickness}px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 0.7s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 2.4s;
  }
`;

/** A loading indicator. */
export const Spinner = ({ size = 16, thickness = 2, label, className }) =>
  label ? (
    <Ring
      className={className}
      role="status"
      aria-label={label}
      $size={size}
      $thickness={thickness}
    />
  ) : (
    <Ring className={className} aria-hidden="true" $size={size} $thickness={thickness} />
  );

Spinner.propTypes = {
  size: PropTypes.number,
  thickness: PropTypes.number,
  label: PropTypes.string,
  className: PropTypes.string,
};

export default Spinner;
