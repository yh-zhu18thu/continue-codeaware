import streamlit as st
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# 初始化数据库连接
DATABASE_URL = "sqlite:///users.db"
engine = create_engine(DATABASE_URL, echo=True)
Base = declarative_base()
SessionLocal = sessionmaker(bind=engine)

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password = Column(String(128), nullable=False)

Base.metadata.create_all(bind=engine)

# 设置Streamlit页面结构
st.set_page_config(page_title="用户注册与登录系统", layout="centered")
st.title("用户注册与登录系统")

menu = ["登录", "注册"]
choice = st.sidebar.selectbox("导航", menu)

if choice == "登录":
    st.subheader("登录")
    # 登录表单 (将在后续步骤实现功能)
    username = st.text_input("用户名")
    password = st.text_input("密码", type="password")
    st.button("登录")
elif choice == "注册":
    st.subheader("注册")
    # 注册表单 (将在后续步骤实现功能)
    new_username = st.text_input("设置用户名")
    new_password = st.text_input("设置密码", type="password")
    st.button("注册")
