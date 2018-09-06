const express = require('express')
const router = express.Router()

const UserModel = require('../models/users')
const PostModel = require('../models/posts')
const CommentModel = require('../models/comments')
const checkLogin = require('../middlewares/check').checkLogin

router.get('/', function(req, res, next){
    const author = req.query.author
    var page = parseInt(req.query.page  || 1)
    var rows = parseInt(req.query.rows || 10)
    let hide = false
    if(author){
        if(req.session.user._id.toString() === author.toString()){
            hide = true
        }
    }

    PostModel.getPosts(author, hide)
        .then(function(posts){
            var pages = Math.ceil(posts.length/rows)
            res.render('posts', {
                posts: posts.slice((page-1)*rows, page*rows),
                pages: pages,
                page: page,
                rows: rows,
            })
        })
        .catch(next)
})

router.get('/create', checkLogin, function(req, res, next){
    res.render('create')
})

router.post('/create', checkLogin, function(req, res, next){
    const author = req.session.user._id
    const title = req.fields.title
    const hide = parseInt(req.fields.hide)
    const content = req. fields.content

    try{
        if(!title.length){
            throw new Error('请填写标题')
        }
        if(!content.length){
            throw new Error('请填写内容')
        }
    }catch(e){
        req.flash('error', e.message)
        return res.redirect('back')
    }

    let post = {
        author: author,
        title: title,
        hide: hide,
        content: content
    }

    PostModel.create(post)
        .then(function(result){
            post = result.ops[0]
            req.flash('success', '发表成功')
            res.redirect(`/posts/${post._id}`)
        })
        .catch(next)
})

router.get('/:postId', function(req, res, next){
    const postId = req.params.postId

    Promise.all([
        PostModel.getPostById(postId),
        CommentModel.getComments(postId),
        PostModel.incPv(postId)
    ])
    .then(function(result){
        const post = result[0]
        const comments = result[1]
        if(!post){
            throw new Error('该文章不存在')
        }
        if(post.author._id.toString() !== req.session.user._id.toString()){
            throw new Error('该文章已隐藏，没有权限查看')
        }

        res.render('post', {
            post: post,
            comments: comments
        })
    })
    .catch(next)
})

router.get('/:postId/edit', checkLogin, function(req, res, next){
    const postId = req.params.postId
    const author = req.session.user._id

    PostModel.getRawPostById(postId)
        .then(function(post){
            if(!post){
                throw new Error('该文章不存在')
            }
            if(author.toString() !== post.author._id.toString()){
                throw new Error('权限不足')
            }
            res.render('edit', {
                post: post
            })
        })
        .catch(next)
})

router.post('/:postId/edit', checkLogin, function(req, res, next){
    const postId = req.params.postId
    const author = req.session.user._id
    const title = req.fields.title
    const hide = parseInt(req.fields.hide)
    const content = req.fields.content

    try{
        if(!title.length){
            throw new Error('请填写标题')
        }
        if(!content.length){
            throw new Error('请填写内容')
        }
    }catch(e){
        req.flash('error', e.message)
        return res.redirect('back')
    }

    PostModel.getRawPostById(postId)
        .then(function(post){
            if(!post){
                throw new Error('文章不存在')
            }
            if(post.author._id.toString() !== author.toString()){
                throw new Error('没有权限')
            }
            PostModel.updatePostById(postId, {title: title, hide: hide, content: content})
                .then(function(){
                    req.flash('success', '编辑文章成功')
                    res.redirect(`/posts/${postId}`)
                })
                .catch(next)
        })
})

router.get('/:postId/remove', checkLogin, function(req, res, next){
    const postId = req.params.postId
    const author = req.session.user._id

    PostModel.getRawPostById(postId)
        .then(function(post){
            if(!post){
                throw new Error('文章不存在')
            }
            if(post.author._id.toString() !== author.toString()){
                throw new Error('没有权限')
            }
            PostModel.delPostById(postId)
                .then(function(){
                    req.flash('success', '删除文章成功')
                    res.redirect('/posts')
                })
                .catch(next)
        })
})

router.get('/:postId/hide', checkLogin, function(req, res, next){
    const postId = req.params.postId
    const author = req.session.user._id

    PostModel.getPostById(postId)
        .then(function(post){
            if(!post){
                throw new Error('文章不存在')
            }
            if(post.author._id.toString() !== author.toString()){
                throw new Error('没有权限')
            }
            if(post.hide === 0){
                PostModel.updatePostById(postId, {hide: 1})
                    .then(function(){
                        req.flash('success', '文章已隐藏')
                        res.redirect('back')
                    })
                    .catch(next)
            }else if(post.hide === 1){
                PostModel.updatePostById(postId, {hide: 0})
                    .then(function(){
                        req.flash('success', '文章已显示')
                        res.redirect('back')
                    })
                    .catch(next)
            }
        })
})

router.get('/:postId/favour', checkLogin, function(req, res, next){
    const postId = req.params.postId
    const name = req.session.user.name

    PostModel.getPostById(postId)
        .then(function(post){
            if(!post){
                throw new Error('文章不存在')
            }
            if(post.favourite.indexOf(name) === -1){
                post.favourite.push(name)
                let postFavourite = post.favourite
                UserModel.getUserByName(name)
                    .then(function(user){
                        user.favourite.push(postId)
                        let userFavourite = user.favourite
                        Promise.all([
                            PostModel.updatePostById(postId, {favourite: postFavourite}),
                            UserModel.updateUserByName(name, {favourite: userFavourite})
                        ])
                        .then(function(){
                            req.flash('success', '收藏成功')
                            res.redirect('back')
                        })
                        .catch(next)
                    })
            }else{
                post.favourite.splice(post.favourite.indexOf(name), 1)
                let postFavourite = post.favourite
                UserModel.getUserByName(name)
                    .then(function(user){
                        user.favourite.splice(user.favourite.indexOf(postId), 1)
                        let userFavourite = user.favourite
                        Promise.all([
                            PostModel.updatePostById(postId, {favourite: postFavourite}),
                            UserModel.updateUserByName(name, {favourite: userFavourite})
                        ])
                        .then(function(){
                            req.flash('success', '取消收藏')
                            res.redirect('back')
                        })
                        .catch(next)
                    })
            }
        })
})

module.exports = router