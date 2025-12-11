
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Navbar from 'react-bootstrap/Navbar';
import PropTypes from 'prop-types';
import { useContext, useState } from 'react';
import { BsX, BsInfoCircle } from 'react-icons/bs';
import { LinkContainer } from 'react-router-bootstrap';
import HeaderButton from 'features/Tethys/components/buttons/HeaderButton';
import SearchBar from 'features/DataStream/components/map/SearchBar';
import { AppContext } from 'features/Tethys/context/context';
import { CustomNavBar, CustomDiv, StyledButton } from 'features/Tethys/components/Styles';
import { GeneralInfoModal } from 'features/DataStream/components/Modals';

const Header = ({onNavChange}) => {
  const {tethysApp, user} = useContext(AppContext);
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
 
              <SearchBar/>
            </CustomDiv>
            <CustomDiv>
              <StyledButton onClick={() => setModalGeneralInfoShow(true)}><BsInfoCircle size="1.5rem"/></StyledButton>
              <Form inline="true">
                <HeaderButton href={tethysApp.exitUrl} tooltipPlacement="bottom" tooltipText="Exit"><BsX size="1.5rem"/></HeaderButton>
              </Form>
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