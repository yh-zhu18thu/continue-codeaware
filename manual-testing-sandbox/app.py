import streamlit as st
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import IntegrityError
import hashlib

# Step 1: 初始化数据库连接
DATABASE_URL = "sqlite:///users.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Step 2: 定义用户数据模型
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    password_hash = Column(String(128), nullable=False)

Base.metadata.create_all(bind=engine)

# 密码加密处理
def hash_password(password):
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def verify_password(password, hashed):
    return hash_password(password) == hashed

# Step 3: 实现用户注册数据处理
def register_user(username, password):
    db = SessionLocal()
    try:
        user = User(username=username, password_hash=hash_password(password))
        db.add(user)
        db.commit()
        db.refresh(user)
        return True, "注册成功！"
    except IntegrityError:
        db.rollback()
        return False, "用户名已存在"
    except Exception as e:
        db.rollback()
        return False, f"注册失败: {str(e)}"
    finally:
        db.close()

# Step 4: 实现用户登录验证逻辑
def login_user(username, password):
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(username=username).first()
        if not user:
            return False, "用户不存在"
        if verify_password(password, user.password_hash):
            return True, "登录成功"
        else:
            return False, "密码错误"
    except Exception as e:
        return False, f"登录失败: {str(e)}"
    finally:
        db.close()

# Streamlit 前端交互
def main():
    st.set_page_config(page_title="用户注册与登录Demo（Streamlit+SQLAlchemy）")
    st.title("用户注册与登录Demo")
    menu = ["登录", "注册"]
    choice = st.sidebar.selectbox("请选择操作", menu)

    if "logged_in" not in st.session_state:
        st.session_state.logged_in = False
    if "username" not in st.session_state:
        st.session_state.username = ""

    # Step 6 & 7: 登录页面界面 + 整合后端逻辑
    if choice == "登录":
        if st.session_state.logged_in:
            st.success(f"欢迎您，{st.session_state.username}！您已登录。")
            if st.button("退出登录"):
                st.session_state.logged_in = False
                st.session_state.username = ""
                st.experimental_rerun()
        else:
            st.subheader("用户登录")
            login_username = st.text_input("用户名")
            login_password = st.text_input("密码", type="password")
            if st.button("登录"):
                if not login_username or not login_password:
                    st.warning("请输入完整用户名和密码！")
                else:
                    success, msg = login_user(login_username, login_password)
                    if success:
                        st.success(msg)
                        st.session_state.logged_in = True
                        st.session_state.username = login_username
                        st.experimental_rerun()
                    else:
                        st.error(msg)

    # Step 5 & 7: 注册页面界面 + 整合后端逻辑
    if choice == "注册":
        st.subheader("用户注册")
        new_username = st.text_input("新用户名")
        new_password = st.text_input("新密码", type="password")
        confirm_password = st.text_input("确认新密码", type="password")
        if st.button("注册"):
            if not new_username or not new_password or not confirm_password:
                st.warning("请填写完整注册信息！")
            elif new_password != confirm_password:
                st.warning("两次输入的密码不一致！")
            else:
                success, msg = register_user(new_username, new_password)
                if success:
                    st.success(msg+", 请返回登录页面登录。")
                else:
                    st.error(msg)

if __name__ == "__main__":
    main()
