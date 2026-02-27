import streamlit as st
import sqlalchemy
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker
import os
import hashlib

# 初始化Streamlit应用框架
st.title('用户注册与登录系统')

st.sidebar.title('导航')
page = st.sidebar.radio('选择页面', ['注册', '登录'])

if page:
    st.write(f"当前页面：{page}")
