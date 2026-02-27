import streamlit as st
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import hashlib

# 数据库设置
DATABASE_URL = 'sqlite:///users.db'
engine = create_engine(DATABASE_URL, echo=True)
Base = declarative_base()
SessionLocal = sessionmaker(bind=engine)

# 用户数据模型
def get_password_hash(password):
    return hashlib.sha256(password.encode()).hexdigest()

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(64), nullable=False)

# 创建数据库表（直接根据Base模型，在数据库生成）
Base.metadata.create_all(bind=engine)

# 用户注册逻辑
def register_user(username, password):
    session = SessionLocal()
    try:
        # 检查用户名是否已经存在
        existing_user = session.query(User).filter_by(username=username).first()
        if existing_user:
            return False, "用户名已存在"
        # 密码加密
        password_hash = get_password_hash(password)
        # 创建新用户
        new_user = User(username=username, password_hash=password_hash)
        session.add(new_user)
        session.commit()
        return True, "注册成功"
    except Exception as e:
        session.rollback()
        return False, f"注册失败: {e}"
    finally:
        session.close()

# 用户登录逻辑
def authenticate_user(username, password):
    session = SessionLocal()
    try:
        user = session.query(User).filter_by(username=username).first()
        if user and user.password_hash == get_password_hash(password):
            return True, "登录成功"
        else:
            return False, "用户名或密码错误"
    except Exception as e:
        return False, f"登录出错: {e}"
    finally:
        session.close()

# Streamlit 前端

def login_form():
    st.header("用户登录")
    login_username = st.text_input("用户名", key='login_username')
    login_password = st.text_input("密码", type="password", key='login_pwd')
    login_btn = st.button("登录")
    login_status = st.empty()
    if login_btn:
        if not login_username or not login_password:
            login_status.warning("用户名和密码均不能为空")
        else:
            success, msg = authenticate_user(login_username, login_password)
            if success:
                login_status.success(msg)
            else:
                login_status.error(msg)


def register_form():
    st.header("用户注册")
    reg_username = st.text_input("用户名", key='reg_username')
    reg_password = st.text_input("密码", type="password", key='reg_pwd')
    reg_password_confirm = st.text_input("确认密码", type="password", key='reg_pwd2')
    reg_btn = st.button("注册")
    reg_status = st.empty()
    if reg_btn:
        if not reg_username or not reg_password:
            reg_status.warning("用户名和密码均不能为空")
        elif reg_password != reg_password_confirm:
            reg_status.warning("密码和确认密码不一致")
        else:
            success, msg = register_user(reg_username, reg_password)
            if success:
                reg_status.success(msg)
            else:
                reg_status.error(msg)

def main():
    st.set_page_config(page_title="用户注册与登录", page_icon="👤")
    st.title("用户注册与登录系统")
    page = st.radio("请选择页面", ("登录", "注册"), horizontal=True)
    if page == "登录":
        login_form()
    else:
        register_form()

if __name__ == "__main__":
    main()
