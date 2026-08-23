
import Container from 'react-bootstrap/Container';
import Navbar from 'react-bootstrap/Navbar';
import PropTypes from 'prop-types';
import { useContext, useState } from 'react';
import { BsInfoCircle } from 'react-icons/bs';
import { LinkContainer } from 'react-router-bootstrap';
import SearchBar from 'features/DataStream/components/map/SearchBar';
import LoadStatus from 'features/DataStream/components/status/LoadStatus';
import { LayersMenu } from 'features/DataStream/components/menus/LayersMenu';
import { AppContext } from 'features/Tethys/context/context';
import { CustomNavBar, CustomDiv, StyledButton } from 'features/Tethys/components/Styles';
import { GeneralInfoModal } from 'features/DataStream/components/Modals';
import { ExperimentalBadge } from 'features/DataStream/components/styles/Styles';

const Header = ({onNavChange}) => {
  const {tethysApp} = useContext(AppContext);
  const [ modalGeneralInfoShow, setModalGeneralInfoShow ] = useState(false);
  return (
    <>
        <CustomNavBar fixed="top" className="shadow">
          <Container as="header" fluid className="px-4">
            <CustomDiv>
              <LinkContainer to="/">
                <Navbar.Brand className="mx-0 d-none d-sm-block">
                  <img 
                    src={tethysApp.icon} 
                    width="30" 
                    height="30"
                    className="d-inline-block align-top rounded-circle"
                    alt=""
                  />
                  {' ' + tethysApp.title}
                </Navbar.Brand>

              </LinkContainer>

              <ExperimentalBadge title="These streamflow predictions are preliminary and are not an operational forecast.">
                Experimental
              </ExperimentalBadge>
 
              <SearchBar/>
              <LoadStatus/>
            </CustomDiv>
            <CustomDiv>
              <StyledButton
                type="button"
                onClick={() => setModalGeneralInfoShow(true)}
                aria-label="About the Research DataStream"
                title="About the Research DataStream"
              >
                <BsInfoCircle size="1.5rem" aria-hidden="true" />
              </StyledButton>
              <LayersMenu inline />
            </CustomDiv>
            <GeneralInfoModal
              show={modalGeneralInfoShow}
              onHide={() => setModalGeneralInfoShow(false)}
            />
          </Container>
        </CustomNavBar>
    </>
  );
};

Header.propTypes = {
  onNavChange: PropTypes.func,
};

export default Header;