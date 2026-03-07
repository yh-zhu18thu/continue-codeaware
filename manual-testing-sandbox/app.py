import streamlit as st
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import IntegrityError
import bcrypt
import os

# Step 2: 创建数据库连接 (SQLite数据库)
DATABASE_URL = 'sqlite:///users.db'
engine = create_engine(DATABASE_URL, connect_args={'check_same_thread': False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Step 1 & 3: 设计用户表结构并定义ORM模型
class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    password_hash = Column(String(128), nullable=False)

# Step 2 (cont): 创建用户表
Base.metadata.create_all(bind=engine)

# Step 4: 用户数据操作函数

def get_user_by_username(username):
    session = SessionLocal()
    user = session.query(User).filter(User.username == username).first()
    session.close()
    return user


def create_user(username, password):
    session = SessionLocal()
    password_hash = hash_password(password)
    user = User(username=username, password_hash=password_hash)
    session.add(user)
    try:
        session.commit()
        session.refresh(user)
        session.close()
        return user, None
    except IntegrityError:
        session.rollback()
        session.close()
        return None, '用户名已存在'

# Step 8: 密码加密存储 (bcrypt)
def hash_password(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain, hashed):
    return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))

# Step 5 & 6: 前端注册和登录界面
st.set_page_config(page_title='用户注册与登录系统', page_icon='🔒')
st.title('用户注册与登录')

menu = st.sidebar.selectbox('请选择操作', ['登录', '注册'])
st.session_state['logged_in'] = st.session_state.get('logged_in', False)
st.session_state['current_user'] = st.session_state.get('current_user', None)

if not st.session_state['logged_in']:
    if menu == '注册':
        st.header('注册新用户')
        reg_username = st.text_input('用户名', max_chars=32, key='reg_username', help="长度2-32字符")
        reg_password = st.text_input('密码', type='password', key='reg_password', help="不少于6位")
        reg_submit = st.button('注册')

        # Step 7: 注册业务流程
        if reg_submit:
            if not reg_username or not reg_password:
                st.warning('请填写所有字段')
            elif len(reg_username) < 2:
                st.warning('用户名过短')
            elif len(reg_password) < 6:
                st.warning('密码不少于6位')
            else:
                user, error = create_user(reg_username, reg_password)
                if user:
                    st.success('注册成功，请登录~')
                else:
                    st.error(error)
    else:
        st.header('用户登录')
        login_username = st.text_input('用户名', key='login_username')
        login_password = st.text_input('密码', type='password', key='login_password')
        login_submit = st.button('登录')

        # Step 9: 登录校验流程
        if login_submit:
            user = get_user_by_username(login_username)
            if not user:
                st.error('用户不存在')
            elif not verify_password(login_password, user.password_hash):
                st.error('密码错误')
            else:
                st.session_state['logged_in'] = True
                st.session_state['current_user'] = login_username
                st.success(f'欢迎回来, {login_username}!')
                st.experimental_rerun()
else:
    # Step 10: 展示登录状态及信息
    st.success(f"已登录，欢迎您: {st.session_state['current_user']}")
    if st.button('登出'):
        st.session_state['logged_in'] = False
        st.session_state['current_user'] = None
        st.success('已登出！')
        st.experimental_rerun()

# Step 11: 简单的功能测试用例

def test_user_flow():
    import random, string
    testname = 'user' + ''.join(random.choices(string.ascii_lowercase, k=4))
    testpw = '12345678'
    user, error = create_user(testname, testpw)
    assert error is None, f"注册失败: {error}"
    got = get_user_by_username(testname)
    assert got, "注册后查找用户失败"
    assert verify_password(testpw, got.password_hash), "密码校验失败"
    print('测试用例通过:', testname)

if os.environ.get('RUN_TESTS') == '1':
    test_user_flow()
