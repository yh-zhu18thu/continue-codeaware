import streamlit as st
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import hashlib
import os

# 配置数据库连接字符串，这里使用SQLite数据库
DATABASE_URL = 'sqlite:///users.db'
engine = create_engine(DATABASE_URL, echo=True)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()
