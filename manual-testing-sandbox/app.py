import streamlit as st
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# 初始化数据库连接
DATABASE_URL = "sqlite:///./users.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Streamlit应用基本结构
st.set_page_config(page_title="用户注册登录示例", page_icon="🔐")
st.title("欢迎来到用户注册和登录系统")
st.write("这是一个由Streamlit和SQLAlchemy搭建的基本前后端分离示例。")
