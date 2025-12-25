# Step 1: 导入必要包并进行环境设置
import streamlit as st
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Step 2: 初始化Streamlit应用入口

def main():
    st.title("用户注册登录界面")
    st.write("欢迎来到用户注册登录系统！")
    # 后续将添加注册/登录表单等

if __name__ == "__main__":
    main()

# Step 3: 定义用户数据模型
Base = declarative_base()

class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False)
    password = Column(String(100), nullable=False)

# 数据库初始化连接（可调整为实际数据库URL）
engine = create_engine('sqlite:///users.db')
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
session = Session()
