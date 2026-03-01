import streamlit as st
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# 创建数据库连接
DATABASE_URL = 'sqlite:///users.db'  # 使用本地SQLite数据库，生产环境推荐其他数据库
engine = create_engine(DATABASE_URL, echo=True)
Base = declarative_base()
SessionLocal = sessionmaker(bind=engine)

# 之后可以定义模型及前端页面
