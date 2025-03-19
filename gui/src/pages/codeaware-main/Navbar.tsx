import { FaDiscourse, FaHome, FaMarker } from "react-icons/fa";
import { NavLink } from "react-router-dom";
import styles from "./Navbar.module.css";

const Navbar = () => {
  return (
    <nav className={styles.navbar}>
      <NavLink
        to="/index"
        className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ""}`}
      >
        <FaHome style={{ marginRight: "5px" }} />
        Overview
      </NavLink>
      <NavLink
        to="/chat"
        className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ""}`}
      >
        <FaDiscourse style={{ marginRight: "5px" }} />
        Chat
      </NavLink>
      <NavLink
        to="/quiz"
        className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ""}`}
      >
        <FaMarker style={{ marginRight: "5px" }} />
        Quiz
      </NavLink>
    </nav>
  );
};

export default Navbar;